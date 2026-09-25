import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDiffHunks } from "../engines/evidence/diff-policy.js";
import { anchorStatus, publishAnchor } from "../ledger/anchor.js";
import { Ledger, verifyChain, verifySignatures } from "../ledger/chain.js";
import { readPrivateKey, readPublicKey } from "../ledger/sign.js";
import { evaluatePolicy, secondPersonGap } from "../policy/evaluate.js";
import { bindCheck } from "../policy/evidence.js";
import { type CheckpointPolicy, parsePolicy } from "../policy/schema.js";
import {
  ciWitnessActive,
  deletedWitness,
  nameStatus,
  witnessGap,
  workflowCommitted,
} from "../policy/witness.js";
import { diffAgainstHead, gitAuthorEmail, listUntracked } from "../policy/worktree.js";

async function record(root: string, payload: Record<string, unknown>) {
  const ledger = new Ledger(root);
  await ledger.append({
    type: "POLICY_CHECK",
    source: "SYSTEM",
    payload,
  });
}

export async function checkCommand(rootArg?: string) {
  process.exitCode = 0;
  const root = path.resolve(rootArg || process.cwd());
  const policyPath = path.join(root, "checkpoint.policy.json");

  let policyRaw: string;
  try {
    policyRaw = await fs.readFile(policyPath, "utf8");
  } catch {
    await record(root, { verdict: "block", reason: "missing_policy" });
    console.error("No checkpoint.policy.json. Run: checkpoint adopt");
    console.error("A missing policy is a block. The refusal is in the ledger.");
    process.exitCode = 2;
    return;
  }

  let policy: CheckpointPolicy;
  try {
    policy = parsePolicy(policyRaw);
  } catch (error) {
    await record(root, { verdict: "block", reason: "invalid_policy" });
    console.error(error instanceof Error ? error.message : "Invalid policy.");
    process.exitCode = 2;
    return;
  }

  const publicPem = await readPublicKey(root);
  const privatePem = await readPrivateKey(root);
  if (!publicPem || !privatePem) {
    await record(root, { verdict: "block", reason: "missing_signing_key" });
    console.error("No signing key. Run: checkpoint adopt");
    console.error("The public key stays in the repo. The private key stays outside it.");
    process.exitCode = 2;
    return;
  }

  const ledger = new Ledger(root);
  const existing = await ledger.read();
  const chain = verifyChain(existing);
  const signed = verifySignatures(existing, publicPem);
  if (!chain.ok || !signed.ok) {
    await record(root, { verdict: "block", reason: "broken_ledger" });
    console.error(
      `Ledger broken at record ${(chain.ok ? signed.brokenAt : chain.brokenAt) ?? "?"}.`,
    );
    console.error("An allow is refused until the chain and the signature both match.");
    process.exitCode = 2;
    return;
  }

  const anchored = await anchorStatus(root, existing);
  if (!anchored.ok) {
    await record(root, { verdict: "block", reason: anchored.reason, seq: anchored.seq });
    console.error(`Anchor check failed (${anchored.reason}).`);
    console.error("A signature can add a line. It cannot drop a hash that git already committed.");
    process.exitCode = 2;
    return;
  }

  let diff = "";
  let untracked: string[] = [];
  let status = "";
  try {
    diff = await diffAgainstHead(root);
    untracked = await listUntracked(root);
    status = await nameStatus(root);
  } catch {
    await record(root, { verdict: "block", reason: "git_diff_failed" });
    console.error("git diff HEAD failed. Checkpoint checks the diff, not the plan.");
    process.exitCode = 2;
    return;
  }

  const bound = bindCheck(policyRaw, diff, publicPem);
  const hunks = parseDiffHunks(diff ? [diff] : [], []);
  const findings = evaluatePolicy(policy, hunks);
  for (const file of untracked) {
    findings.push({
      ruleId: "unseen-file",
      verdict: "needs_approval",
      file,
      message: "This file is not in the git diff. Checkpoint will not pass a file it cannot see.",
    });
  }
  const committed = await workflowCommitted(root);
  const witness = witnessGap(policy.witness, committed);
  if (witness) findings.push(witness);
  const removed = deletedWitness(status, policy.witness);
  if (removed) findings.push(removed);
  const author = await gitAuthorEmail(root);
  const gap = secondPersonGap(policy, author, findings);
  if (gap) findings.push(gap);
  const blocks = findings.filter(
    (item) => item.verdict === "block" || item.verdict === "needs_approval",
  );
  const verdict = blocks.length > 0 ? "block" : "allow";

  await record(root, {
    verdict,
    rules: findings.map((item) => item.ruleId),
    files: [...hunks.map((hunk) => hunk.file), ...untracked],
    policyDigest: bound.policyDigest,
    diffDigest: bound.diffDigest,
    keyDigest: bound.keyDigest,
    subject: bound.subject,
    author: author || null,
    witness: ciWitnessActive() ? "ci" : "local",
  });
  await publishAnchor(root, await ledger.read());

  console.log("Checkpoint\n");
  console.log(`Policy   ${bound.policyDigest}`);
  console.log(`Diff     ${bound.diffDigest}`);
  console.log(`Key      ${bound.keyDigest}`);
  console.log(`Subject  ${bound.subject}`);
  console.log(`Files    ${hunks.length + untracked.length}\n`);

  if (findings.length === 0) {
    const certified = policy.witness === "local" || ciWitnessActive();
    console.log(certified ? "allow" : "local");
    console.log("No rule fired on the added lines.");
    console.log(
      certified
        ? "This allow covers only this policy, this diff, and this public key."
        : "This machine passed. Require the checkpoint status check before merge.",
    );
    return;
  }

  for (const finding of findings) {
    console.log(`${finding.verdict}  ${finding.ruleId}`);
    console.log(`       ${finding.file}`);
    console.log(`       ${finding.message}\n`);
  }

  if (blocks.length > 0) {
    console.log(`${blocks.length} block. The plan cannot clear this.`);
    console.log("The refusal is signed and stored in the ledger.");
    process.exitCode = 2;
  }
}
