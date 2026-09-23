import { UnderstandingEngine } from "../engines/understanding/index.js";
import { MemoryEngine } from "../engines/memory/index.js";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function inspectCommand(customCwd?: string) {
  const cwd = customCwd ? path.resolve(customCwd) : process.cwd();
  console.log(`\n🔍 Checkpoint Inspection: ${cwd}\n`);

  // 1. Project Understanding
  const understanding = new UnderstandingEngine();
  const context = await understanding.scanWorkspace(cwd);
  console.log("== Project Understanding ==");
  console.log(`Runtime:        ${context.runtime || "Unknown"}`);
  console.log(`Language:       ${context.language || "Unknown"}`);
  console.log(`Package Mgr:    ${context.packageManager || "Unknown"}`);
  console.log(`Frameworks:     ${context.frameworks.length > 0 ? context.frameworks.join(", ") : "None detected"}`);
  console.log(`Testing:        ${context.testingSetup.length > 0 ? context.testingSetup.join(", ") : "None detected"}`);
  console.log(`Build Tooling:  ${context.buildTooling.length > 0 ? context.buildTooling.join(", ") : "None detected"}`);
  console.log(`Architecture:   ${context.architecturalPatterns.length > 0 ? context.architecturalPatterns.join(", ") : "None detected"}`);
  if (context.entrypoints.length > 0) {
    console.log(`Entrypoints:`);
    for (const ep of context.entrypoints) {
      console.log(`  - ${ep}`);
    }
  } else {
    console.log(`Entrypoints:    None detected`);
  }
  console.log();

  // 2. Conventions / Memories
  const memoryEngine = new MemoryEngine();
  const memories = await memoryEngine.getAllMemories(cwd);
  console.log("== Project Conventions ==");
  if (memories.length > 0) {
    for (const mem of memories) {
      console.log(`- [${mem.type}] ${mem.content}`);
    }
  } else {
    console.log("No conventions recorded.");
  }
  console.log();

  // 3. Active Decisions
  console.log("== Active Decisions ==");
  const decisionsDir = path.join(cwd, ".checkpoint", "decisions");
  let decisionsCount = 0;
  try {
    const files = await fs.readdir(decisionsDir);
    for (const file of files) {
      if (file.endsWith(".md") || file.endsWith(".json")) {
        console.log(`- ${file}`);
        decisionsCount++;
      }
    }
  } catch {
    // Directory might not exist
  }
  if (decisionsCount === 0) {
    console.log("No active decisions recorded.");
  }
  console.log();

  // 4. Checkpoint State
  console.log("== Current State ==");
  const stateFile = path.join(cwd, ".checkpoint", "state.json");
  try {
    const raw = await fs.readFile(stateFile, "utf-8");
    const state = JSON.parse(raw);
    console.log(`Task ID: ${state.taskId || "None"}`);
    console.log(`Plan ID: ${state.planId || "None"}`);
    console.log(`Status:  ${state.status || "IDLE"}`);
  } catch {
    console.log("No state.json found. Is Checkpoint initialized?");
  }
  console.log();

  // 5. Git Working Tree
  console.log("== Working Tree ==");
  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd });
    if (stdout.trim().length === 0) {
      console.log("Clean (no uncommitted changes).");
    } else {
      console.log("Uncommitted changes detected.");
      const lines = stdout.trim().split("\n");
      for (const line of lines.slice(0, 5)) {
        console.log(`  ${line}`);
      }
      if (lines.length > 5) {
        console.log(`  ... and ${lines.length - 5} more.`);
      }
    }
  } catch {
    console.log("Not a git repository, or git is not installed.");
  }
  console.log();
}
