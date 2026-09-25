import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { checkCommand } from "../src/commands/check.js";
import { anchorText, GENESIS_ANCHOR, ledgerExtends } from "../src/ledger/anchor.js";
import { GENESIS_HASH, Ledger, type LedgerEvent } from "../src/ledger/chain.js";
import { ensureKeypair } from "../src/ledger/sign.js";
import { HOUSE_POLICY } from "../src/policy/schema.js";
import { CI_WORKFLOW, CI_WORKFLOW_PATH } from "../src/policy/witness.js";

const exec = promisify(execFile);
const dirs: string[] = [];

afterEach(async () => {
  delete process.env.CHECKPOINT_KEY_DIR;
  process.exitCode = 0;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function git(cwd: string, args: string[]) {
  await exec("git", args, { cwd });
}

async function preparedRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), "checkpoint-anchor-"));
  const keys = await mkdtemp(path.join(tmpdir(), "checkpoint-keys-"));
  dirs.push(dir, keys);
  process.env.CHECKPOINT_KEY_DIR = keys;
  await git(dir, ["init"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await writeFile(path.join(dir, "README"), "ok\n");
  await writeFile(
    path.join(dir, "checkpoint.policy.json"),
    `${JSON.stringify(HOUSE_POLICY, null, 2)}\n`,
  );
  await ensureKeypair(dir);
  await writeFile(path.join(dir, "checkpoint.anchor"), anchorText(GENESIS_ANCHOR));
  await mkdir(path.join(dir, ".github/workflows"), { recursive: true });
  await writeFile(path.join(dir, CI_WORKFLOW_PATH), CI_WORKFLOW);
  await git(dir, [
    "add",
    "README",
    "checkpoint.policy.json",
    "checkpoint.pub",
    "checkpoint.anchor",
    CI_WORKFLOW_PATH,
  ]);
  await git(dir, ["commit", "-m", "policy"]);
  return dir;
}

async function sealTip(dir: string) {
  await checkCommand(dir);
  expect(process.exitCode).toBe(0);
  await git(dir, ["add", "checkpoint.anchor"]);
  await git(dir, ["commit", "-m", "anchor"]);
}

async function replaceLedger(dir: string) {
  await rm(path.join(dir, ".checkpoint", "ledger.jsonl"));
  const ledger = new Ledger(dir);
  await ledger.append({
    type: "POLICY_CHECK",
    source: "SYSTEM",
    payload: { verdict: "allow", replaced: true },
  });
  return ledger;
}

async function lastReason(dir: string): Promise<string> {
  const raw = await readFile(path.join(dir, ".checkpoint", "ledger.jsonl"), "utf8");
  const lines = raw.trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]) as { payload: { reason?: string } };
  return last.payload.reason ?? "";
}

describe("committed anchor", () => {
  test("a ledger extends a named hash and rejects a different one", () => {
    const kept = { seq: 1, hash: "a".repeat(64) } as LedgerEvent;
    expect(ledgerExtends([kept], { seq: 1, hash: kept.hash })).toBe(true);
    expect(ledgerExtends([kept], { seq: 1, hash: "b".repeat(64) })).toBe(false);
    expect(ledgerExtends([], { seq: 0, hash: GENESIS_HASH })).toBe(true);
  });

  test("a re-signed ledger that drops a committed hash is blocked", async () => {
    const dir = await preparedRepo();
    await sealTip(dir);
    await replaceLedger(dir);
    await checkCommand(dir);
    expect(process.exitCode).toBe(2);
    expect(await lastReason(dir)).toBe("anchor_mismatch");
  });

  test("a worktree edit of checkpoint.anchor does not clear a dropped hash", async () => {
    const dir = await preparedRepo();
    await sealTip(dir);
    await writeFile(path.join(dir, "checkpoint.anchor"), anchorText(GENESIS_ANCHOR));
    await replaceLedger(dir);
    await checkCommand(dir);
    expect(process.exitCode).toBe(2);
    expect(await lastReason(dir)).toBe("anchor_mismatch");
  });

  test("the remote anchor still blocks after a local commit replaces it", async () => {
    const dir = await preparedRepo();
    await sealTip(dir);
    const remote = await mkdtemp(path.join(tmpdir(), "checkpoint-remote-"));
    dirs.push(remote);
    await git(remote, ["init", "--bare"]);
    await git(dir, ["remote", "add", "origin", remote]);
    await git(dir, ["push", "-u", "origin", "HEAD"]);
    const ledger = await replaceLedger(dir);
    const tip = (await ledger.read())[0];
    await writeFile(
      path.join(dir, "checkpoint.anchor"),
      anchorText({ seq: tip.seq, hash: tip.hash }),
    );
    await git(dir, ["add", "checkpoint.anchor"]);
    await git(dir, ["commit", "-m", "replace anchor"]);
    await checkCommand(dir);
    expect(process.exitCode).toBe(2);
    expect(await lastReason(dir)).toBe("remote_anchor_mismatch");
  });
});
