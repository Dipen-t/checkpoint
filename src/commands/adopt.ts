import { promises as fs } from "node:fs";
import path from "node:path";
import { anchorText, GENESIS_ANCHOR } from "../ledger/anchor.js";
import { ensureKeypair, publicKeyPath } from "../ledger/sign.js";
import {
  type CheckpointPolicy,
  type ProfileName,
  parsePolicy,
  policyForProfile,
} from "../policy/schema.js";
import { CI_WORKFLOW, CI_WORKFLOW_PATH, GITLAB_CI, GITLAB_CI_PATH } from "../policy/witness.js";

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function findHouseRoot(root: string): Promise<boolean> {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    const base = path.basename(dir);
    if (base === "node_modules" || base === ".next" || base === "vendor" || base === "dist") {
      continue;
    }
    const services = path.join(dir, "Services");
    const controllers = path.join(dir, "Controllers");
    if ((await exists(services)) && (await exists(controllers))) return true;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name));
    }
  }
  return false;
}

const PROFILES = new Set<ProfileName>(["local", "team", "house"]);

export function splitAdoptArgs(
  first?: string,
  second?: string,
): { root?: string; profile?: string } {
  if (first && PROFILES.has(first as ProfileName)) return { profile: first, root: second };
  if (second && PROFILES.has(second as ProfileName)) return { root: first, profile: second };
  return { root: first };
}

export async function adoptCommand(rootArg?: string, profileArg?: string) {
  const split = splitAdoptArgs(rootArg, profileArg);
  const root = path.resolve(split.root || process.cwd());
  const requested = split.profile;
  const target = path.join(root, "checkpoint.policy.json");
  let policy: CheckpointPolicy;
  if (await exists(target)) {
    console.log(`checkpoint.policy.json already exists in ${root}`);
    try {
      policy = parsePolicy(await fs.readFile(target, "utf8"));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Invalid policy.");
      process.exitCode = 2;
      return;
    }
  } else {
    const profile = (requested as ProfileName) || ((await findHouseRoot(root)) ? "house" : "team");
    policy = policyForProfile(profile);
    await fs.writeFile(target, `${JSON.stringify(policy, null, 2)}\n`);
    console.log(`Wrote the ${profile} profile.`);
    console.log(target);
    console.log(
      "Edit reviewers, witness, requireReviewer, imports, and approvalRequired in that file.",
    );
  }

  try {
    const keys = await ensureKeypair(root);
    console.log(keys.created ? "Wrote checkpoint.pub." : "Signing key already present.");
    console.log(`Public key  ${publicKeyPath(root)}`);
    console.log(`Private key ${keys.privatePath}`);
    const anchorPath = path.join(root, "checkpoint.anchor");
    if (!(await exists(anchorPath))) {
      await fs.writeFile(anchorPath, anchorText(GENESIS_ANCHOR));
      console.log("Wrote checkpoint.anchor.");
    }
    if (policy.witness === "ci") {
      const workflowPath = path.join(root, CI_WORKFLOW_PATH);
      if (!(await exists(workflowPath))) {
        await fs.mkdir(path.dirname(workflowPath), { recursive: true });
        await fs.writeFile(workflowPath, CI_WORKFLOW);
        console.log("Wrote .github/workflows/checkpoint.yml.");
      }
      const gitlabPath = path.join(root, GITLAB_CI_PATH);
      if (!(await exists(gitlabPath))) {
        await fs.writeFile(gitlabPath, GITLAB_CI);
        console.log("Wrote .gitlab-ci.checkpoint.yml.");
      }
      console.log("Commit the policy, the public key, the anchor, and one CI file.");
      console.log("Require the checkpoint status check before merge.");
    } else {
      console.log("Commit the policy, the public key, and checkpoint.anchor.");
      console.log(
        "This profile keeps the record on the laptop. Set witness to ci when you want the pull-request job.",
      );
    }
    console.log("Leave the private key outside the repo.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not prepare the signing key.");
    process.exitCode = 2;
  }
}
