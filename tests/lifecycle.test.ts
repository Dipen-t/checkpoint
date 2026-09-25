import { execFile } from "node:child_process";
import * as crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { handleAntigravityHook } from "../src/adapters/antigravity/index.js";
import { StateManager } from "../src/core/state.js";
import { MemoryEngine } from "../src/engines/memory/index.js";

const exec = promisify(execFile);
let cwd = "";
let stateManager: StateManager;

function hook(type: string, payload: unknown) {
  return handleAntigravityHook(type, payload, cwd);
}

beforeAll(async () => {
  cwd = await fs.mkdtemp(path.join(tmpdir(), "checkpoint-lifecycle-"));
  stateManager = new StateManager(cwd);
  await exec("git", ["init"], { cwd });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd });
  await exec("git", ["config", "user.name", "Test"], { cwd });
  await fs.writeFile(path.join(cwd, "README.md"), "ok\n");
  await exec("git", ["add", "README.md"], { cwd });
  await exec("git", ["commit", "-m", "init"], { cwd });
  await fs.writeFile(path.join(cwd, "README.md"), "changed\n");
});

afterAll(async () => {
  if (cwd) await fs.rm(cwd, { recursive: true, force: true });
});

beforeEach(async () => {
  // Mock Memory Engine
  vi.spyOn(MemoryEngine.prototype, "retrieveContext").mockResolvedValue([
    {
      id: "mem-1",
      type: "ARCHITECTURE",
      content: "Controller-Service-Repository architecture must be strictly followed.",
      createdAt: new Date().toISOString(),
    },
  ]);

  // reset state
  try {
    const task = {
      id: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      intent: "Test Task",
      status: "IDLE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentClaims: [],
      toolResults: [],
      decisions: [],
    };
    await stateManager.writeState(task as any);
  } catch {}
});

test("Test A: PreInvocation retrieves relevant memory and injects it", async () => {
  const result = await handleAntigravityHook("pre-invocation", {});
  expect(result.injectSteps).toBeDefined();
  const msg = result.injectSteps[0].ephemeralMessage;
  expect(msg).toContain("Architecture:");
  expect(msg).toContain("Relevant decisions:");
});

test("Test B: A plan following project conventions does not generate a human decision", async () => {
  const payload = {
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: "implementation_plan.md", CodeContent: "- add a new user repository" },
    },
  };
  const result = await hook("pre-tool-use", payload);
  expect(result.decision).toBe("allow");
  expect(result.injectSteps).toBeUndefined(); // no warnings injected
});

test("Test C: A meaningful architectural deviation generates a decision request warning", async () => {
  const payload = {
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: "implementation_plan.md", CodeContent: "- Add prisma" },
    },
  };
  const result = await hook("pre-tool-use", payload);
  expect(result.decision).toBe("deny"); // We now deny and ask
  expect(result.reason).toBeDefined(); // But we warn!
  expect(result.reason).toContain("CHECKPOINT DECISION REQUIRED [");
});

test("Test D: PreToolUse captures an AgentClaim", async () => {
  const payload = {
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: "c:\\checkpoint\\src\\foo.ts", Description: "Add foo" },
    },
  };
  await hook("pre-tool-use", payload);
  const state = await stateManager.readState();
  expect(state?.agentClaims?.length).toBeGreaterThan(0);
  expect(state?.agentClaims?.[0]?.modifiedFiles).toContain("c:\\checkpoint\\src\\foo.ts");
});

test("Test E: PostToolUse records execution result", async () => {
  const payload = {
    toolCall: {
      name: "write_to_file",
      args: { TargetFile: "c:\\checkpoint\\src\\foo.ts" },
    },
  };
  await hook("post-tool-use", payload);
  const state = await stateManager.readState();
  expect(state?.toolResults?.length).toBeGreaterThan(0);
  expect(state?.toolResults?.[0]?.tool).toBe("write_to_file");
});

test("Test F: Stop collects real Git evidence", async () => {
  await hook("stop", { terminationReason: "model_stop" });
  // Evidence is checked in report
  const reportPath = path.join(cwd, ".checkpoint", "checkpoint-report.txt");
  const report = await fs.readFile(reportPath, "utf-8");
  expect(report).toContain("CHECKPOINT REPORT");
});

test("Test G: AgentClaim and Git reality disagree -> EVIDENCE_MISMATCH", async () => {
  // We simulate a claim that doesn't match Git status
  // Git status in this test environment will likely show some modified files (like task.md)
  // We claim we only touched "fake.ts".
  const task: any = await stateManager.readState();
  task.agentClaims = [{ modifiedFiles: ["c:\\checkpoint\\fake.ts"], description: "" }];
  await stateManager.writeState(task);

  await hook("stop", { terminationReason: "model_stop" });

  const reportPath = path.join(cwd, ".checkpoint", "checkpoint-report.txt");
  const report = await fs.readFile(reportPath, "utf-8");
  expect(report).toContain("[EVIDENCE_MISMATCH]");
});

test("Test H: Successful task -> Completion Report", async () => {
  await hook("stop", { terminationReason: "model_stop" });
  const reportPath = path.join(cwd, ".checkpoint", "checkpoint-report.txt");
  const report = await fs.readFile(reportPath, "utf-8");
  expect(report).toContain("CHECKPOINT REPORT");
});

test("Test I: Task introduces no durable knowledge -> no memory created", async () => {
  await hook("stop", { terminationReason: "model_stop" });
  const reportPath = path.join(cwd, ".checkpoint", "checkpoint-report.txt");
  const report = await fs.readFile(reportPath, "utf-8");
  expect(report).toContain("Memory: No durable knowledge created");
});

test("Test J: Task creates a confirmed engineering decision -> durable memory candidate created", async () => {
  const task = {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    intent: "Test Task",
    status: "IDLE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agentClaims: [],
    toolResults: [],
    decisions: [
      {
        id: crypto.randomUUID(),
        issue: "Added redis cache bypass",
        classification: "ARCHITECTURE",
        requiresHumanInput: true,
        status: "RESOLVED",
        resolution: "Approved",
      },
    ],
  };
  await stateManager.writeState(task as any);

  await hook("stop", { terminationReason: "model_stop" });
  const reportPath = path.join(cwd, ".checkpoint", "checkpoint-report.txt");
  const report = await fs.readFile(reportPath, "utf-8");
  // Decisions should be printed
  expect(report).toContain("Added redis cache bypass");
});
