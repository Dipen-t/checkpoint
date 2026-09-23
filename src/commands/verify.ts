import { StateManager } from "../core/state.js";
import { VerificationEngine } from "../engines/verification/index.js";
import { ScopeEngine } from "../engines/scope/index.js";
import { ConsistencyEngine } from "../engines/consistency/index.js";
import { MemoryEngine } from "../engines/memory/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentClaim, Evidence } from "../models/verification.js";

const execAsync = promisify(exec);

export async function verifyCommand() {
  const cwd = process.cwd();
  const stateManager = new StateManager(cwd);
  
  try {
    const task = await stateManager.readState();
    if (!task) {
      console.log("No active Checkpoint session found.");
      return;
    }

    console.log("CHECKPOINT VERIFICATION\n");
    console.log("Gathering repository evidence...");

    let gitDiffs: string[] = [];
    let modifiedFiles: string[] = [];
    try {
      const { stdout: diffStdout } = await execAsync("git diff", { cwd });
      gitDiffs = [diffStdout];
      
      const { stdout: statusStdout } = await execAsync("git status --porcelain", { cwd });
      modifiedFiles = statusStdout.split("\n").filter(l => l.trim()).map(l => l.substring(3).trim());
    } catch {
      console.log("Could not read Git evidence. Is this a Git repository?");
      return;
    }

    const observedEvidence = {
      gitDiffs,
      modifiedFiles,
      testResults: "UNKNOWN" as const
    };

    const allClaimedFiles = new Set<string>();
    if (task.agentClaims) {
      for (const claim of task.agentClaims) {
        for (const file of claim.modifiedFiles) {
          const relative = path.relative(cwd, file).replace(/\\/g, "/");
          allClaimedFiles.add(relative);
        }
      }
    }

    const claim: AgentClaim = {
      modifiedFiles: Array.from(allClaimedFiles),
      description: "Aggregated agent claims"
    };

    const evidence: Evidence = { claim, observed: observedEvidence };

    const scopeEngine = new ScopeEngine();
    const consistencyEngine = new ConsistencyEngine();
    const verificationEngine = new VerificationEngine(scopeEngine, consistencyEngine);
    const memoryEngine = new MemoryEngine(cwd);
    
    const memories = await memoryEngine.retrieveContext(task.intent, cwd);

    const plan = {
      id: task.planId || randomUUID(),
      taskId: task.id,
      proposedSteps: [],
      affectedComponents: [],
      status: "DRAFT" as const
    };
    
    const scope = {
      id: randomUUID(),
      planId: plan.id,
      allowedFiles: [],
      allowedDirectories: [""], 
      explicitlyForbidden: []
    };

    const result = verificationEngine.verify(plan, scope, evidence, memories);

    console.log(`\nModified files detected:`);
    if (modifiedFiles.length === 0) {
      console.log("None");
    } else {
      modifiedFiles.forEach(f => console.log(`✓ ${f}`));
    }
    console.log();

    if (result.detectedDeviations.length === 0) {
      console.log("Verification: PASSED");
      console.log("No deviations detected between claims and implementation.");
    } else {
      console.log("Verification: FAILED");
      for (const dev of result.detectedDeviations) {
        console.log(`- [${dev.type}] ${dev.description}`);
      }
    }
    console.log();
  } catch (err) {
    console.error("Verification failed:", err);
  }
}
