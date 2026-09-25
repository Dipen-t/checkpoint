import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Finding } from "./evaluate.js";

const execFileAsync = promisify(execFile);

/** The job name GitHub and GitLab should require before merge. */
export const CI_WORKFLOW_PATH = ".github/workflows/checkpoint.yml";
export const GITLAB_CI_PATH = ".gitlab-ci.checkpoint.yml";

export const GITLAB_CI = `checkpoint:
  stage: test
  script:
    - npx --yes nah-checkpoint check
`;

export const CI_WORKFLOW = `name: checkpoint

on:
  pull_request:
  push:
    branches: [main, master]

jobs:
  checkpoint:
    name: checkpoint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Check the diff
        run: npx --yes nah-checkpoint check
`;

export function ciWitnessActive(): boolean {
  return process.env.GITHUB_ACTIONS === "true" || process.env.GITLAB_CI === "true";
}

async function blobExists(root: string, file: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["cat-file", "-e", `HEAD:${file}`], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

/** GitHub Actions or the GitLab snippet. Either one is the second machine. */
export async function workflowCommitted(root: string): Promise<boolean> {
  const github = await blobExists(root, CI_WORKFLOW_PATH);
  if (github) return true;
  return blobExists(root, GITLAB_CI_PATH);
}

export async function nameStatus(root: string): Promise<string> {
  const result = await execFileAsync("git", ["diff", "HEAD", "--name-status"], { cwd: root });
  return result.stdout;
}

/** A clean diff on a laptop is not the allow that merges. CI has to run the same check. */
export function witnessGap(witness: "ci" | "local", workflowInHead: boolean): Finding | null {
  if (witness !== "ci" || workflowInHead) return null;
  return {
    ruleId: "missing-ci-witness",
    verdict: "block",
    file: CI_WORKFLOW_PATH,
    message:
      "Commit .github/workflows/checkpoint.yml. Require the checkpoint status check before merge.",
  };
}

export function deletedWitness(status: string, witness: "ci" | "local"): Finding | null {
  if (witness !== "ci") return null;
  const watched = new Set([CI_WORKFLOW_PATH, GITLAB_CI_PATH]);
  const removed = status.split("\n").some((line) => {
    const [kind, file] = line.split("\t");
    return kind === "D" && watched.has(file?.replaceAll("\\", "/") ?? "");
  });
  if (!removed) return null;
  return {
    ruleId: "deleted-ci-witness",
    verdict: "block",
    file: CI_WORKFLOW_PATH,
    message: "Removing the CI witness is a block. That job is the second check.",
  };
}
