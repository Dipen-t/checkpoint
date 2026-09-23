import { test, expect } from "vitest";
import { FinalEvaluator, DeterministicEvaluator } from "../src/core/evaluator.js";
import { SemanticEvaluator } from "../src/llm/semantic-evaluator.js";
import { MockProvider } from "../src/llm/provider.js";
import type { Conflict } from "../src/models/verification.js";
import { randomUUID } from "node:crypto";

const mockResponses = {
  "Add a command using the existing engine": {
    conflictDetected: false,
    significance: "LOW",
    risk: "LOW",
    requiresHumanInput: false,
    reasoning: "Routine addition of a command.",
    evidenceReferences: [],
    confidence: "HIGH"
  },
  "Put persistence logic directly inside the CLI": {
    conflictDetected: true,
    significance: "HIGH",
    risk: "HIGH",
    requiresHumanInput: true,
    reasoning: "Violates architecture boundary.",
    evidenceReferences: [],
    confidence: "HIGH"
  },
  "Refactor the authentication system": {
    conflictDetected: true,
    significance: "HIGH",
    risk: "HIGH",
    requiresHumanInput: true,
    reasoning: "Needs more details on auth changes.",
    evidenceReferences: [],
    confidence: "INSUFFICIENT_CONTEXT"
  },
  "Use direct database access in this one-off migration": {
    conflictDetected: true,
    significance: "LOW",
    risk: "LOW",
    requiresHumanInput: false,
    reasoning: "Acceptable one-off exception for migrations.",
    evidenceReferences: [],
    confidence: "HIGH"
  },
  "Direct persistence": {
    conflictDetected: false,
    significance: "LOW",
    risk: "LOW",
    requiresHumanInput: false,
    reasoning: "Repository layer is deprecated according to code snippets.",
    evidenceReferences: ["src/repositories/README.md"],
    confidence: "HIGH"
  }
};

const provider = new MockProvider(mockResponses);
const det = new DeterministicEvaluator();
const sem = new SemanticEvaluator(provider);
const finalEvaluator = new FinalEvaluator(det, sem);

test("LLM: Routine", async () => {
  const conflict: Conflict = {
    id: randomUUID(),
    source: "PLAN",
    subject: "Add a command using the existing engine",
    proposedAction: "Add a command using the existing engine",
    severity: "MEDIUM",
    confidence: 0.5,
    context: ""
  };
  const res = await finalEvaluator.evaluateConflict(conflict, []);
  // Note: Since deterministic heuristic detects 'using an existing engine' as NO_CONFLICT,
  // it might short circuit.
  // Wait, if it short circuits, we are testing deterministic!
  // To truly test Semantic Evaluator, we need to bypass deterministic or test SemanticEvaluator directly.
  const semRes = await sem.evaluate(conflict);
  expect(semRes?.type).toBe("NO_CONFLICT");
});

test("LLM: Architectural", async () => {
  const conflict: Conflict = {
    id: randomUUID(),
    source: "PLAN",
    subject: "Put persistence logic directly inside the CLI",
    proposedAction: "Put persistence logic directly inside the CLI",
    severity: "MEDIUM",
    confidence: 0.5,
    context: ""
  };
  const semRes = await sem.evaluate(conflict);
  expect(semRes?.type).toBe("HUMAN_DECISION_REQUIRED");
  expect(semRes?.risk).toBe("HIGH");
});

test("LLM: Ambiguous", async () => {
  const conflict: Conflict = {
    id: randomUUID(),
    source: "PLAN",
    subject: "Refactor the authentication system",
    proposedAction: "Refactor the authentication system",
    severity: "MEDIUM",
    confidence: 0.5,
    context: ""
  };
  const semRes = await sem.evaluate(conflict);
  // Returns null for INSUFFICIENT_CONTEXT
  expect(semRes).toBeNull();
});

test("LLM: Intentional exception", async () => {
  const conflict: Conflict = {
    id: randomUUID(),
    source: "PLAN",
    subject: "Use direct database access in this one-off migration",
    proposedAction: "Use direct database access in this one-off migration",
    severity: "MEDIUM",
    confidence: 0.5,
    context: ""
  };
  const semRes = await sem.evaluate(conflict);
  expect(semRes?.type).toBe("ACCEPTED_EXCEPTION");
});

test("LLM: Contradictory evidence", async () => {
  const conflict: Conflict = {
    id: randomUUID(),
    source: "PLAN",
    subject: "Direct persistence",
    proposedAction: "Direct persistence",
    severity: "MEDIUM",
    confidence: 0.5,
    context: "Code snippet says Repositories are deprecated."
  };
  const semRes = await sem.evaluate(conflict);
  expect(semRes?.type).toBe("NO_CONFLICT");
});
