import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { checkCommand } from "../src/commands/check.js";
import {
  GENESIS_HASH,
  hashEvent,
  Ledger,
  verifyChain,
  verifySignatures,
} from "../src/ledger/chain.js";
import { ensureKeypair, readPublicKey } from "../src/ledger/sign.js";
import { HOUSE_POLICY } from "../src/policy/schema.js";
import { CI_WORKFLOW, CI_WORKFLOW_PATH } from "../src/policy/witness.js";

const exec = promisify(execFile);
const dirs: string[] = [];

afterEach(async () => {
  delete process.env.CHECKPOINT_KEY_DIR;
  process.exitCode = 0;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "checkpoint-sign-"));
  dirs.push(dir);
  return dir;
}

async function git(cwd: string, args: string[]) {
  await exec("git", args, { cwd });
}

async function repoWithPolicy() {
  const dir = await tempDir();
  const keys = await mkdtemp(path.join(tmpdir(), "checkpoint-keys-"));
  dirs.push(keys);
  process.env.CHECKPOINT_KEY_DIR = keys;
  await git(dir, ["init"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await writeFile(path.join(dir, "README"), "ok\n");
  await git(dir, ["add", "README"]);
  await git(dir, ["commit", "-m", "init"]);
  await writeFile(
    path.join(dir, "checkpoint.policy.json"),
    `${JSON.stringify(HOUSE_POLICY, null, 2)}\n`,
  );
  await ensureKeypair(dir);
  await writeFile(
    path.join(dir, "checkpoint.anchor"),
    `${JSON.stringify({ seq: 0, hash: GENESIS_HASH }, null, 2)}\n`,
  );
  await mkdir(path.join(dir, ".github/workflows"), { recursive: true });
  await writeFile(path.join(dir, CI_WORKFLOW_PATH), CI_WORKFLOW);
  await git(dir, [
    "add",
    "checkpoint.policy.json",
    "checkpoint.pub",
    "checkpoint.anchor",
    CI_WORKFLOW_PATH,
  ]);
  await git(dir, ["commit", "-m", "policy"]);
  return dir;
}

describe("signed ledger", () => {
  test("rewriting the chain without the private key fails the signature", async () => {
    const dir = await tempDir();
    const keys = await mkdtemp(path.join(tmpdir(), "checkpoint-keys-"));
    dirs.push(keys);
    process.env.CHECKPOINT_KEY_DIR = keys;
    await ensureKeypair(dir);
    const ledger = new Ledger(dir);
    await ledger.append({ type: "POLICY_CHECK", source: "SYSTEM", payload: { verdict: "allow" } });
    await ledger.append({ type: "POLICY_CHECK", source: "SYSTEM", payload: { verdict: "allow" } });

    const events = await ledger.read();
    events[0].payload = { verdict: "allow", tampered: true };
    events[0].hash = hashEvent(events[0]);
    events[1].prevHash = events[0].hash;
    events[1].hash = hashEvent(events[1]);
    await writeFile(
      path.join(dir, ".checkpoint", "ledger.jsonl"),
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );

    const rewritten = await ledger.read();
    const publicPem = await readPublicKey(dir);
    expect(verifyChain(rewritten).ok).toBe(true);
    expect(verifySignatures(rewritten, publicPem ?? "").ok).toBe(false);
  });

  test("a staged Prisma call in a controller is blocked", async () => {
    const dir = await repoWithPolicy();
    const file = path.join(dir, "server/src/Controllers/user.controller.js");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "const rows = await prisma.users.findMany();\n");
    await git(dir, ["add", "server/src/Controllers/user.controller.js"]);
    await checkCommand(dir);
    expect(process.exitCode).toBe(2);
    const raw = await readFile(path.join(dir, ".checkpoint", "ledger.jsonl"), "utf8");
    expect(raw).toContain("prisma-stays-in-services");
    expect(raw).toContain('"signature"');
  });

  test("an untracked file does not pass", async () => {
    const dir = await repoWithPolicy();
    await checkCommand(dir);
    expect(process.exitCode).toBe(0);
    await writeFile(path.join(dir, "secret-note.js"), "export const n = 1;\n");
    await checkCommand(dir);
    expect(process.exitCode).toBe(2);
    const raw = await readFile(path.join(dir, ".checkpoint", "ledger.jsonl"), "utf8");
    expect(raw).toContain("unseen-file");
  });
});
