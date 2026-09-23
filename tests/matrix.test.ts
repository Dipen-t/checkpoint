import { test, expect } from "vitest";
import { DecisionEngine } from "../src/engines/decision/index.js";
import type { Plan } from "../src/models/plan.js";
import type { Memory } from "../src/models/memory.js";
import type { Decision } from "../src/models/decision.js";
import { randomUUID } from "node:crypto";
import { FinalEvaluator, DeterministicEvaluator } from "../src/core/evaluator.js";
import { SemanticEvaluator } from "../src/llm/semantic-evaluator.js";
import { getProvider } from "../src/llm/provider.js";

const det = new DeterministicEvaluator();
const sem = new SemanticEvaluator(getProvider());
const evaluator = new FinalEvaluator(det, sem);
const decisionEngine = new DecisionEngine(evaluator);

const memories: Memory[] = [
  {
    id: randomUUID(),
    type: "ARCHITECTURE",
    content: "CLI commands delegate business logic to Core/Engines.",
    confidence: "CONFIRMED",
    provenance: "Project Rule",
  },
  {
    id: randomUUID(),
    type: "CONVENTION",
    content: "Use npm.",
    confidence: "CONFIRMED",
    provenance: "Project Rule",
  }
];

function makePlan(step: string): Plan {
  return {
    id: randomUUID(),
    taskId: randomUUID(),
    proposedSteps: [step],
    affectedComponents: [],
    status: "DRAFT",
  };
}

test("Case A: Routine -> NO_HUMAN_INPUT", async () => {
  const plan = makePlan("Add a new cli command using an existing engine.");
  const { decisions } = await decisionEngine.evaluatePlan(plan, memories, []);
  expect(decisions.length).toBe(0);
});

test("Case B: Existing convention -> NO_HUMAN_INPUT", async () => {
  const plan = makePlan("Add a dependency and update package-lock.json using npm.");
  const { decisions } = await decisionEngine.evaluatePlan(plan, memories, []);
  expect(decisions.length).toBe(0);
});

test("Case C: Architectural deviation -> HUMAN_DECISION_REQUIRED", async () => {
  const plan = makePlan("Put business logic directly into the cli command.");
  const { decisions } = await decisionEngine.evaluatePlan(plan, memories, []);
  expect(decisions.length).toBe(1);
  expect(decisions[0].requiresHumanInput).toBe(true);
  expect(decisions[0].provenance?.risk).toBe("HIGH");
});

test("Case D: Intentional exception -> NO_HUMAN_INPUT", async () => {
  const plan = makePlan("Use a tiny formatting helper directly inside the cli.");
  const { decisions } = await decisionEngine.evaluatePlan(plan, memories, []);
  expect(decisions.length).toBe(0);
});

test("Case E: Security-sensitive decision -> HUMAN_DECISION_REQUIRED", async () => {
  const plan = makePlan("Add credential handling and login authentication.");
  const { decisions } = await decisionEngine.evaluatePlan(plan, memories, []);
  expect(decisions.length).toBe(1);
  expect(decisions[0].requiresHumanInput).toBe(true);
  expect(decisions[0].provenance?.risk).toBe("CRITICAL");
});

test("Case F: Data-model change -> HUMAN_DECISION_REQUIRED", async () => {
  const plan = makePlan("Update postgres database schema and run migration.");
  const { decisions } = await decisionEngine.evaluatePlan(plan, memories, []);
  expect(decisions.length).toBe(1);
  expect(decisions[0].requiresHumanInput).toBe(true);
  expect(decisions[0].provenance?.risk).toBe("HIGH");
});

test("Case G: Dependency change -> Distinguish routine from fundamental", async () => {
  // Routine dependency
  const plan1 = makePlan("Add dependency lodash via npm install.");
  const { decisions: decisions1 } = await decisionEngine.evaluatePlan(plan1, memories, []);
  expect(decisions1.length).toBe(0);

  // Fundamental framework change
  const plan2 = makePlan("Add dependency express via npm install.");
  const { decisions: decisions2 } = await decisionEngine.evaluatePlan(plan2, memories, []);
  expect(decisions2.length).toBe(1);
  expect(decisions2[0].requiresHumanInput).toBe(true);
  expect(decisions2[0].provenance?.risk).toBe("HIGH");
});

test("Case H: Existing scoped decision -> FOLLOW_EXISTING_DECISION", async () => {
  const priorDecision: Decision = {
    id: randomUUID(),
    issue: "Allow logic in foo",
    classification: "ARCHITECTURE",
    requiresHumanInput: false,
    status: "RESOLVED",
    scopedTo: ["foo.ts"]
  };

  // Attempting to put logic in foo.ts -> Should auto-resolve
  const plan1 = makePlan("Put business logic directly into the cli command foo.ts.");
  const { decisions: decisions1 } = await decisionEngine.evaluatePlan(plan1, memories, [priorDecision]);
  expect(decisions1.length).toBe(0);

  // Attempting to put logic in bar.ts -> Should NOT auto-resolve
  const plan2 = makePlan("Put business logic directly into the cli command bar.ts.");
  const { decisions: decisions2 } = await decisionEngine.evaluatePlan(plan2, memories, [priorDecision]);
  expect(decisions2.length).toBe(1);
});
