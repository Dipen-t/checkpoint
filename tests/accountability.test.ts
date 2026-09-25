import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FinalEvaluator, DeterministicEvaluator } from "../src/core/evaluator.js";
import { StateManager } from "../src/core/state.js";
import { WorkflowEngine } from "../src/core/workflow.js";
import { ConsistencyEngine } from "../src/engines/consistency/index.js";
import { ScopeEngine } from "../src/engines/scope/index.js";
import { VerificationEngine } from "../src/engines/verification/index.js";
import { Ledger, verifyChain } from "../src/ledger/chain.js";
import { FallbackProvider, MockProvider } from "../src/llm/provider.js";
import { SemanticEvaluator } from "../src/llm/semantic-evaluator.js";
import type { Conflict } from "../src/models/verification.js";
import { randomUUID } from "node:crypto";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "checkpoint-ledger-"));
  dirs.push(dir);
  return dir;
}

describe("accountability release bar", () => {
  test("a changed ledger line breaks the chain", async () => {
    const dir = await tempDir();
    const ledger = new Ledger(dir);
    await ledger.append({ type: "STATE_TRANSITION", source: "SYSTEM", payload: { to: "PLAN" } });
    await ledger.append({ type: "DECISION_EVALUATED", source: "SYSTEM", payload: { outcome: "NO_CONFLICT" } });

    const file = path.join(dir, ".checkpoint", "ledger.jsonl");
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    const first = JSON.parse(lines[0]);
    first.payload.outcome = "tampered";
    lines[0] = JSON.stringify(first);
    await writeFile(file, `${lines.join("\n")}\n`);

    const result = await ledger.verify();
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  test("passwords are dropped before a record is hashed", async () => {
    const dir = await tempDir();
    const ledger = new Ledger(dir);
    await ledger.append({
      type: "LOGIN",
      source: "AGENT",
      payload: { identifier: "user-1", password: "super-secret", note: "token=abc123" },
    });
    const raw = await readFile(path.join(dir, ".checkpoint", "ledger.jsonl"), "utf8");
    expect(raw).not.toContain("super-secret");
    expect(raw).not.toContain("abc123");
    expect(raw).toContain("user-1");
    const events = await ledger.read();
    expect(verifyChain(events).ok).toBe(true);
  });

  test("a model cannot clear a critical block", async () => {
    const provider = new MockProvider({
      "credential": {
        conflictDetected: false,
        significance: "LOW",
        risk: "LOW",
        requiresHumanInput: false,
        reasoning: "Looks fine.",
        evidenceReferences: [],
        confidence: "HIGH",
      },
    });
    const evaluator = new FinalEvaluator(new DeterministicEvaluator(), new SemanticEvaluator(provider));
    const conflict: Conflict = {
      id: randomUUID(),
      source: "PLAN",
      subject: "Add credential handling",
      proposedAction: "Add credential handling",
      severity: "CRITICAL",
      confidence: 0.9,
      context: "Security boundary change detected in plan.",
    };
    const resolution = await evaluator.evaluateConflict(conflict, []);
    expect(resolution.escalateToHuman).toBe(true);
    expect(resolution.risk).toBe("CRITICAL");
  });

  test("a consistency check that fails asks for review", async () => {
    const engine = new ConsistencyEngine(new FallbackProvider());
    const deviations = await engine.evaluateEvidence({
      claim: { modifiedFiles: ["src/a.ts"] },
      observed: {
        gitDiffs: ["+ const value = 1;"],
        modifiedFiles: ["src/a.ts"],
        testResults: "PASSED",
      },
    }, [{
      id: randomUUID(),
      type: "ARCHITECTURE",
      content: "Use the repository layer.",
      confidence: "CONFIRMED",
      provenance: "test",
    }]);
    expect(deviations[0]?.severity).toBe("CRITICAL");
  });

  test("changed files with no observed tests do not pass", async () => {
    const verification = new VerificationEngine(new ScopeEngine(), new ConsistencyEngine(new FallbackProvider()));
    const result = await verification.verify(
      {
        id: randomUUID(),
        taskId: randomUUID(),
        proposedSteps: ["Edit a file"],
        affectedComponents: [],
        status: "APPROVED",
      },
      {
        id: randomUUID(),
        planId: randomUUID(),
        allowedFiles: ["src/a.ts"],
        allowedDirectories: [],
        explicitlyForbidden: [],
      },
      {
        claim: { modifiedFiles: ["src/a.ts"] },
        observed: {
          gitDiffs: ["+ const value = 1;"],
          modifiedFiles: ["src/a.ts"],
          testResults: "UNKNOWN",
        },
      },
      [],
    );
    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.detectedDeviations.some((item) => item.description.includes("did not observe a test result"))).toBe(true);
  });

  test("a state change is written into the chain", async () => {
    const dir = await tempDir();
    const state = new StateManager(dir);
    await state.init();
    const workflow = new WorkflowEngine(state, dir);
    const now = new Date().toISOString();
    await workflow.transition({
      id: randomUUID(),
      sessionId: randomUUID(),
      intent: "Ship the ledger",
      status: "IDLE",
      createdAt: now,
      updatedAt: now,
    }, "DISCOVERY");
    const ledger = new Ledger(dir);
    const result = await ledger.verify();
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });
});
