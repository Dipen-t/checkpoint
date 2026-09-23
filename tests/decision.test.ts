import { test, expect } from "vitest";
import { DecisionEngine } from "../src/engines/decision/index.js";
import type { Plan } from "../src/models/plan.js";
import type { Memory } from "../src/models/memory.js";
import type { Decision } from "../src/models/decision.js";
import { FinalEvaluator, DeterministicEvaluator } from "../src/core/evaluator.js";
import { SemanticEvaluator } from "../src/llm/semantic-evaluator.js";
import { getProvider } from "../src/llm/provider.js";
import { randomUUID } from "node:crypto";

const det = new DeterministicEvaluator();
const sem = new SemanticEvaluator(getProvider());
const evaluator = new FinalEvaluator(det, sem);
const decisionEngine = new DecisionEngine(evaluator);

const archMemory: Memory = {
  id: randomUUID(),
  type: "ARCHITECTURE",
  content: "All database access must go through the Repository layer.",
  confidence: "CONFIRMED",
  provenance: "Project Rule",
};

test("Scenario A — Existing convention (No Block)", async () => {
  const plan: Plan = {
    id: randomUUID(),
    taskId: randomUUID(),
    proposedSteps: ["Add a new user repository and use it from the service."],
    affectedComponents: ["src/repositories"],
    status: "DRAFT",
  };

  const { decisions } = await decisionEngine.evaluatePlan(plan, [archMemory], []);
  expect(decisions.length).toBe(0);
});

test("Scenario B — Meaningful architectural deviation (Blocks)", async () => {
  const plan: Plan = {
    id: randomUUID(),
    taskId: randomUUID(),
    proposedSteps: ["Access Prisma directly from the controller."],
    affectedComponents: ["src/controllers"],
    status: "DRAFT",
  };

  const { decisions } = await decisionEngine.evaluatePlan(plan, [archMemory], []);
  expect(decisions.length).toBe(1);
  expect(decisions[0].requiresHumanInput).toBe(true);
  expect(decisions[0].provenance?.reason).toContain("Data model changes impact global state");
});

test("Scenario C — Intentional exception (Auto Resolve)", async () => {
  const plan: Plan = {
    id: randomUUID(),
    taskId: randomUUID(),
    proposedSteps: ["Use Prisma directly in this migration script."],
    affectedComponents: ["prisma/migrations"],
    status: "DRAFT",
  };

  const { decisions } = await decisionEngine.evaluatePlan(plan, [archMemory], []);
  // The evaluator should return ACCEPTED_EXCEPTION, so escalateToHuman is false, meaning 0 decisions are pushed.
  expect(decisions.length).toBe(0);
});

test("Scenario D — Existing human decision overrides convention", async () => {
  const plan: Plan = {
    id: randomUUID(),
    taskId: randomUUID(),
    proposedSteps: ["Access Prisma directly in the admin dashboard controllers."],
    affectedComponents: ["src/controllers/admin"],
    status: "DRAFT",
  };

  const priorDecision: Decision = {
    id: randomUUID(),
    issue: "Should admin dashboard bypass repositories for speed?",
    resolution: "Yes, admin dashboard controllers can access Prisma directly.",
    classification: "ARCHITECTURE",
    requiresHumanInput: false,
    status: "RESOLVED",
    scopedTo: ["admin dashboard controllers"],
  };

  const { decisions } = await decisionEngine.evaluatePlan(plan, [archMemory], [priorDecision]);
  // The evaluator should return FOLLOW_EXISTING_DECISION, so escalateToHuman is false.
  expect(decisions.length).toBe(0);
});
