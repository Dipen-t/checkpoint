import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function doctorCommand() {
  const cwd = process.cwd();
  console.log(`\n🏥 Checkpoint Doctor: ${cwd}\n`);

  let allChecksPassed = true;

  const runCheck = async (name: string, checkFn: () => Promise<void>) => {
    try {
      await checkFn();
      console.log(`[PASS] ${name}`);
    } catch (err: any) {
      console.log(`[FAIL] ${name}`);
      console.log(`       -> ${err.message}`);
      allChecksPassed = false;
    }
  };

  // 1. Checkpoint Directory
  await runCheck(".checkpoint/ directory exists", async () => {
    const cpDir = path.join(cwd, ".checkpoint");
    const stat = await fs.stat(cpDir);
    if (!stat.isDirectory()) throw new Error("Not a directory");
  });

  // 2. State Readability
  await runCheck("State file is readable", async () => {
    const stateFile = path.join(cwd, ".checkpoint", "state.json");
    const content = await fs.readFile(stateFile, "utf-8");
    JSON.parse(content);
  });

  // 3. Memory Readability
  await runCheck("Memory directory is readable", async () => {
    const memDir = path.join(cwd, ".checkpoint", "memory");
    const stat = await fs.stat(memDir);
    if (!stat.isDirectory()) throw new Error("Not a directory");
    await fs.readdir(memDir);
  });

  // 4. Git availability
  await runCheck("Git is available and inside a repository", async () => {
    const { stdout } = await execAsync("git rev-parse --is-inside-work-tree", { cwd });
    if (stdout.trim() !== "true") throw new Error("Not inside a git work tree");
  });

  // 5. Project Configuration
  await runCheck("Project configuration (package.json) is readable", async () => {
    const pkgFile = path.join(cwd, "package.json");
    const content = await fs.readFile(pkgFile, "utf-8");
    JSON.parse(content);
  });

  // 6. Ledger, when one exists
  await runCheck("Ledger chain is intact", async () => {
    const { Ledger } = await import("../ledger/chain.js");
    const ledger = new Ledger(cwd);
    const result = await ledger.verify();
    if (!result.ok) throw new Error(`Chain broken at record ${result.brokenAt}`);
  });

  console.log();
  if (allChecksPassed) {
    console.log("✅ The environment is healthy and ready for Checkpoint.");
    process.exit(0);
  } else {
    console.log("❌ The environment has issues. Checkpoint may not function correctly.");
    process.exit(1);
  }
}
