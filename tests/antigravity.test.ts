import { test, expect, vi, beforeAll } from "vitest";
import { handleAntigravityHook, AntigravityAdapter } from "../src/adapters/antigravity/index.js";
import { promises as fs } from "node:fs";
import * as path from "node:path";

beforeAll(async () => {
  const memoryDir = path.join(process.cwd(), ".checkpoint", "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(
    path.join(memoryDir, "test-memory.json"),
    JSON.stringify({
      id: "123",
      type: "ARCHITECTURE",
      content: "Test Architecture Memory",
      confidence: "CONFIRMED",
      provenance: "TEST"
    })
  );
});

test("Adapter capability test", () => {
  const adapter = new AntigravityAdapter();
  const caps = adapter.getCapabilities();
  expect(caps.canPause).toBe(true);
  expect(caps.canReceiveContext).toBe(true);
});

test("PreInvocation translates to PROVIDE_CONTEXT action", async () => {
  const payload = {
    invocationNum: 0,
    // transcript parsing is best effort, we just simulate the payload
  };
  
  const result = await handleAntigravityHook("pre-invocation", payload);
  expect(result).toHaveProperty("injectSteps");
  expect(result.injectSteps[0]).toHaveProperty("ephemeralMessage");
  expect(result.injectSteps[0].ephemeralMessage).toContain("Architecture");
});

test("PreToolUse returns allow for observation mode", async () => {
  const payload = {
    toolCall: {
      name: "replace_file_content",
      args: {
        TargetFile: "/src/test.ts",
        Description: "Editing file"
      }
    }
  };

  const result = await handleAntigravityHook("pre-tool-use", payload);
  // Due to observation mode, it should just return allow (or `{ decision: 'allow' }` effectively)
  // Our logic sets this via CONTINUE action.
  expect(result).toHaveProperty("decision", "allow");
});

test("Stop payload handling", async () => {
  const payload = {
    terminationReason: "model_stop"
  };

  const result = await handleAntigravityHook("stop", payload);
  // It shouldn't block the stop
  expect(result.decision).toBeUndefined();
});

test("Gracefully handles missing or malformed data", async () => {
  const result = await handleAntigravityHook("pre-tool-use", null);
  // Should fallback to empty object, not crash
  expect(result).toEqual({});
});

test("Plan parsing extracts nested bullets, asterisks, pluses, and numbers", async () => {
  const payload = {
    toolCall: {
      name: "write_to_file",
      args: {
        TargetFile: "implementation_plan.md",
        CodeContent: `
# Implementation Plan
- Standard bullet
  - Nested bullet
* Asterisk bullet
+ Plus bullet
1. Numbered bullet
Not a bullet
`
      }
    }
  };

  // We have to mock the DecisionEngine.evaluatePlan to intercept the parsed plan
  // since handleAntigravityHook doesn't return the parsed plan directly.
  const { DecisionEngine } = await import("../src/engines/decision/index.js");
  const evaluatePlanSpy = vi.spyOn(DecisionEngine.prototype, "evaluatePlan").mockResolvedValue({
    decisions: [],
    evaluations: []
  });

  await handleAntigravityHook("pre-tool-use", payload);
  
  expect(evaluatePlanSpy).toHaveBeenCalled();
  const planArg = evaluatePlanSpy.mock.calls[0][0];
  expect(planArg.proposedSteps).toEqual([
    "Standard bullet",
    "Nested bullet",
    "Asterisk bullet",
    "Plus bullet",
    "Numbered bullet"
  ]);

  evaluatePlanSpy.mockRestore();
});

test("REQUEST_HUMAN_DECISION returns deny and chat reason", async () => {
  const adapter = new AntigravityAdapter();
  await adapter.dispatchAction({
    type: "REQUEST_HUMAN_DECISION",
    decision: {
      id: "dec-123",
      issue: "Architecture deviation",
      classification: "ARCHITECTURE",
      requiresHumanInput: true,
      status: "PENDING"
    } as any
  });

  const response = adapter.getHookResponse();
  expect(response.decision).toBe("deny");
  expect(response.reason).toContain("CHECKPOINT DECISION REQUIRED [dec-123]");
  expect(response.reason).toContain("Please ask the user to resolve this decision via the checkpoint skill");
});
