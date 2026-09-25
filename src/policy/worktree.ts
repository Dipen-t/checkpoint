import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Staged and unstaged edits against HEAD. `git diff` alone hides a staged file. */
export async function diffAgainstHead(root: string): Promise<string> {
  const result = await execFileAsync("git", ["diff", "HEAD", "--unified=0"], { cwd: root });
  return result.stdout;
}

export function untrackedFromPorcelain(porcelain: string): string[] {
  return porcelain.split("\n").flatMap((line) => {
    if (!line.startsWith("?? ")) return [];
    const file = line.slice(3).replaceAll('"', "").trim();
    if (!file || file === ".checkpoint" || file.startsWith(".checkpoint/")) return [];
    return [file];
  });
}

export async function gitAuthorEmail(root: string): Promise<string> {
  try {
    const result = await execFileAsync("git", ["config", "user.email"], { cwd: root });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

export async function listUntracked(root: string): Promise<string[]> {
  const result = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
  });
  return untrackedFromPorcelain(result.stdout);
}
