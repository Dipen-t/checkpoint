import { test, expect, beforeAll } from "vitest";
import { UnderstandingEngine } from "../src/engines/understanding/index.js";
import { MemoryEngine } from "../src/engines/memory/index.js";
import { DecisionEngine } from "../src/engines/decision/index.js";
import { DeterministicEvaluator } from "../src/core/evaluator.js";
import { ScopeEngine } from "../src/engines/scope/index.js";
import { ConsistencyEngine } from "../src/engines/consistency/index.js";
import { VerificationEngine } from "../src/engines/verification/index.js";
import type { Task } from "../src/models/task.js";
import type { Plan } from "../src/models/plan.js";
import type { Scope } from "../src/models/scope.js";
import type { Evidence } from "../src/models/verification.js";
import type { Decision } from "../src/models/decision.js";
import * as path from "node:path";
import { promises as fs } from "node:fs";

const WORKSPACE_ROOT = path.join(__dirname, "..", "checkpoint-lab", "layered-node-api");
const memoryDir = path.join(WORKSPACE_ROOT, ".checkpoint", "memory");

beforeAll(async () => {
  await fs.rm(memoryDir, { recursive: true, force: true });
  await fs.mkdir(memoryDir, { recursive: true });
});

test("Proof of Heart E2E sequence", async () => {
  // Setup Memory directory and mock some memory
  await fs.writeFile(
    path.join(memoryDir, "mem-1.json"),
    JSON.stringify({
      id: "123e4567-e89b-12d3-a456-426614174000",
      type: "ARCHITECTURE",
      content: "All database access must go through the Repository layer.",
      confidence: "CONFIRMED",
      provenance: "DEC-001"
    })
  );

  // 1. Init engines
  const understanding = new UnderstandingEngine();
  const { FinalEvaluator, DeterministicEvaluator } = await import("../src/core/evaluator.js");
  const { SemanticEvaluator } = await import("../src/llm/semantic-evaluator.js");
  const { getProvider, MockProvider } = await import("../src/llm/provider.js");

  const det = new DeterministicEvaluator();
  const sem = new SemanticEvaluator(getProvider());
  const evaluator = new FinalEvaluator(det, sem);
  const decision = new DecisionEngine(evaluator);
  const scopeEngine = new ScopeEngine();
  
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
  const consistency = new ConsistencyEngine(mockProvider);
  const verification = new VerificationEngine(scopeEngine, consistency);
  const memory = new MemoryEngine();

  // 2. Intent -> Project Understanding
  const task: Task = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    sessionId: "123e4567-e89b-12d3-a456-426614174002",
    intent: "Add user notification feature",
    status: "DISCOVERY",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const context = await understanding.scanWorkspace(WORKSPACE_ROOT);
  expect(context.architecturalPatterns).toContain("Layered Controller-Service Architecture");

  // 3. Retrieve Memory
  const retrievedMemories = await memory.retrieveContext(task.intent, WORKSPACE_ROOT);
  expect(retrievedMemories.length).toBeGreaterThan(0);
  expect(retrievedMemories[0].content).toContain("Repository");

  // 4. Evaluate Plan (Decision Engine)
  const proposedPlan: Plan = {
    id: "123e4567-e89b-12d3-a456-426614174003",
    taskId: task.id,
    proposedSteps: [
      "Create NotificationController",
      "Directly query Prisma for notifications in Controller" // Intentional violation
    ],
    affectedComponents: ["controllers"],
    status: "DRAFT"
  };

  const { decisions } = await decision.evaluatePlan(proposedPlan, retrievedMemories, []);
  // Decision engine should flag this
  expect(decisions.length).toBe(1);
  expect(decisions[0].requiresHumanInput).toBe(true);
  expect(decisions[0].classification).toBe("ARCHITECTURE");

  // Resolve the decision (simulating human input)
  const resolvedDecisions: Decision[] = [
    {
      ...decisions[0],
      resolution: "Create NotificationRepository instead of using Prisma in Controller.",
      status: "RESOLVED"
    }
  ];

  // 5. Detect Deviations (Scope & Consistency via Verification Engine)
  const approvedScope: Scope = {
    id: "123e4567-e89b-12d3-a456-426614174004",
    planId: proposedPlan.id,
    allowedFiles: [],
    allowedDirectories: ["src/controllers", "src/repositories"],
    explicitlyForbidden: []
  };

  const simulatedEvidence: Evidence = {
    claim: {
      modifiedFiles: ["src/controllers/notification.controller.ts"],
      description: "Added notification controller",
    },
    observed: {
      gitDiffs: ["+ prisma.notification.findMany()"],
      modifiedFiles: ["src/controllers/notification.controller.ts", "package.json"], // package.json is out of scope and unclaimed!
      testResults: "PASSED"
    }
  };

  const verificationResult = await verification.verify(proposedPlan, approvedScope, simulatedEvidence, retrievedMemories);
  
  expect(verificationResult.status).toBe("REQUIRES_REVIEW");
  expect(verificationResult.detectedDeviations.length).toBeGreaterThanOrEqual(2);
  
  const scopeViolation = verificationResult.detectedDeviations.find(d => d.type === "SCOPE");
  expect(scopeViolation).toBeDefined();

  const archViolation = verificationResult.detectedDeviations.find(d => d.type === "ARCHITECTURE");
  expect(archViolation).toBeDefined();

  // 6. Memory Extraction
  await memory.extractMemory(resolvedDecisions, WORKSPACE_ROOT);
  const files = await fs.readdir(memoryDir);
  // Should have the original mem-1.json and the newly extracted memory
  expect(files.length).toBeGreaterThan(1);
});
