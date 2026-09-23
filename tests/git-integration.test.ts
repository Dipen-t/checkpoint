import { test, expect, beforeAll, afterAll } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ScopeEngine } from "../src/engines/scope/index.js";
import { ConsistencyEngine } from "../src/engines/consistency/index.js";
import { VerificationEngine } from "../src/engines/verification/index.js";
import type { Plan } from "../src/models/plan.js";
import type { Scope } from "../src/models/scope.js";
import type { Memory } from "../src/models/memory.js";
import type { Evidence, AgentClaim } from "../src/models/verification.js";
import { randomUUID } from "node:crypto";

const execAsync = promisify(exec);
const REPO_PATH = path.join(__dirname, "temp-git-repo");

beforeAll(async () => {
  // Clean up and create temp dir
  await fs.rm(REPO_PATH, { recursive: true, force: true });
  await fs.mkdir(REPO_PATH, { recursive: true });

  // Init git and baseline files
  await execAsync(`git init`, { cwd: REPO_PATH });
  await fs.mkdir(path.join(REPO_PATH, "src", "controllers"), { recursive: true });
  await fs.writeFile(path.join(REPO_PATH, "package.json"), '{"name":"test"}');
  await fs.writeFile(path.join(REPO_PATH, "src", "controllers", "user.controller.ts"), "// initial controller");
  
  await execAsync(`git config user.email "test@example.com"`, { cwd: REPO_PATH });
  await execAsync(`git config user.name "Test User"`, { cwd: REPO_PATH });
  await execAsync(`git add .`, { cwd: REPO_PATH });
  await execAsync(`git commit -m "Initial commit"`, { cwd: REPO_PATH });
});

afterAll(async () => {
  try {
    await fs.rm(REPO_PATH, { recursive: true, force: true });
  } catch {
    // Windows file locks may cause EBUSY
  }
});

test("Real Git Evidence - Verification Engine", async () => {
  // 1. Simulate agent modifying files
  // Agent adds prisma directly to controller (Architectural deviation)
  await fs.appendFile(path.join(REPO_PATH, "src", "controllers", "user.controller.ts"), "\nprisma.user.findMany();");
  // Agent maliciously modifies package.json (Scope deviation AND Evidence mismatch since it won't claim it)
  await fs.writeFile(path.join(REPO_PATH, "package.json"), '{"name":"hacked"}');

  // 2. Extract actual Git diffs and modified files
  const { stdout: diffOut } = await execAsync(`git diff`, { cwd: REPO_PATH });
  const { stdout: nameOut } = await execAsync(`git diff --name-only`, { cwd: REPO_PATH });
  
  const gitDiffs = [diffOut];
  const observedFiles = nameOut.trim().split("\n").filter(Boolean);

  // 3. Construct the Evidence object
  const agentClaim: AgentClaim = {
    modifiedFiles: ["src/controllers/user.controller.ts"], // Agent lies by omitting package.json
    description: "Added user fetching",
  };

  const evidence: Evidence = {
    claim: agentClaim,
    observed: {
      gitDiffs,
      modifiedFiles: observedFiles,
      testResults: "PASSED",
    }
  };

  // 4. Run Verification
  const { MockProvider } = await import("../src/llm/provider.js");
  const mockProvider = new MockProvider({
    "prisma": {
      isConsistent: false,
      deviations: [{
        type: "ARCHITECTURE",
        description: "Controller appears to bypass the Repository layer by directly calling the database.",
        severity: "CRITICAL"
      }]
    }
  });
  const verification = new VerificationEngine(new ScopeEngine(), new ConsistencyEngine(mockProvider));
  
  const plan: Plan = {
    id: randomUUID(),
    taskId: randomUUID(),
    proposedSteps: ["Fetch users"],
    affectedComponents: ["src/controllers"],
    status: "APPROVED"
  };

  const scope: Scope = {
    id: randomUUID(),
    planId: plan.id,
    allowedFiles: [],
    allowedDirectories: ["src/controllers"],
    explicitlyForbidden: []
  };

  const memory: Memory = {
    id: randomUUID(),
    type: "ARCHITECTURE",
    content: "All database access must go through the Repository layer.",
    confidence: "CONFIRMED",
    provenance: "Rule"
  };

  const result = await verification.verify(plan, scope, evidence, [memory]);

  // 5. Assertions
  expect(result.status).toBe("REQUIRES_REVIEW");

  const mismatchDevs = result.detectedDeviations.filter(d => d.type === "EVIDENCE_MISMATCH");
  expect(mismatchDevs.length).toBe(1);
  expect(mismatchDevs[0].description).toContain("package.json"); // Found the lie

  const scopeDevs = result.detectedDeviations.filter(d => d.type === "SCOPE");
  expect(scopeDevs.length).toBe(1);
  expect(scopeDevs[0].description).toContain("package.json"); // Found the out of scope edit

  const archDevs = result.detectedDeviations.filter(d => d.type === "ARCHITECTURE");
  expect(archDevs.length).toBe(1);
  expect(archDevs[0].description).toContain("Controller"); // Found the direct DB access
});
