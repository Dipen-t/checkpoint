import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { checkCommand } from "../src/commands/check.js";
import { anchorText, GENESIS_ANCHOR } from "../src/ledger/anchor.js";
import { ensureKeypair } from "../src/ledger/sign.js";
import { GENERIC_POLICY } from "../src/policy/schema.js";
import { CI_WORKFLOW, CI_WORKFLOW_PATH, deletedWitness } from "../src/policy/witness.js";

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

async function repo(withWorkflow: boolean) {
  const dir = await mkdtemp(path.join(tmpdir(), "checkpoint-witness-"));
  const keys = await mkdtemp(path.join(tmpdir(), "checkpoint-keys-"));
  dirs.push(dir, keys);
  process.env.CHECKPOINT_KEY_DIR = keys;
  await git(dir, ["init"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
  await writeFile(path.join(dir, "README"), "ok\n");
  await writeFile(path.join(dir, "checkpoint.policy.json"), `${JSON.stringify(GENERIC_POLICY)}\n`);
  await ensureKeypair(dir);
  await writeFile(path.join(dir, "checkpoint.anchor"), anchorText(GENESIS_ANCHOR));
  if (withWorkflow) {
    await mkdir(path.join(dir, ".github/workflows"), { recursive: true });
    await writeFile(path.join(dir, CI_WORKFLOW_PATH), CI_WORKFLOW);
  }
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "init"]);
  return dir;
}

describe("CI witness", () => {
  test("a repository without the workflow cannot pass", async () => {
    const dir = await repo(false);
    await checkCommand(dir);
    expect(process.exitCode).toBe(2);
    const raw = await readFile(path.join(dir, ".checkpoint", "ledger.jsonl"), "utf8");
    expect(raw).toContain("missing-ci-witness");
  });

  test("deleting the workflow is a block", () => {
    const finding = deletedWitness(`D\t${CI_WORKFLOW_PATH}\n`, "ci");
    expect(finding?.ruleId).toBe("deleted-ci-witness");
    expect(finding?.verdict).toBe("block");
  });

  test("a committed workflow lets a normal edit pass on this machine", async () => {
    const dir = await repo(true);
    await checkCommand(dir);
    expect(process.exitCode).toBe(0);
  });
});
