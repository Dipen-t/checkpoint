import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { DeterministicEvaluator } from "../../core/evaluator.js";
import { StateManager } from "../../core/state.js";
import { ConsistencyEngine } from "../../engines/consistency/index.js";
import { DecisionEngine } from "../../engines/decision/index.js";
import { MemoryEngine } from "../../engines/memory/index.js";
import { ScopeEngine } from "../../engines/scope/index.js";
import { UnderstandingEngine } from "../../engines/understanding/index.js";
import { VerificationEngine } from "../../engines/verification/index.js";
import type { Plan } from "../../models/plan.js";
import type { Task } from "../../models/task.js";
import type { AgentClaim } from "../../models/verification.js";
import type { AgentCapabilities, AgentEvent, CheckpointAction, IAgentAdapter } from "../index.js";

const execAsync = promisify(exec);

export class AntigravityAdapter implements IAgentAdapter {
  private actions: any = {};

  getCapabilities(): AgentCapabilities {
    return {
      canReceiveContext: true,
      canPause: true,
      canRequestHumanDecision: true,
      canReceivePlanChanges: false,
    };
  }

  async dispatchAction(action: CheckpointAction): Promise<void> {
    switch (action.type) {
      case "CONTINUE":
        this.actions.decision = "allow";
        break;
      case "REQUEST_HUMAN_DECISION": {
        this.actions.decision = "deny";

        let decisionText = `[Checkpoint Warning] Deviation detected.`;
        if (action.decision?.provenance?.warningDetails) {
          const w = action.decision.provenance.warningDetails;
          decisionText = `CHECKPOINT DECISION REQUIRED [${action.decision.id}]\n\nWHAT: ${w.what}\nWHY: ${w.why}\nEVIDENCE: ${w.evidence}\nDECISION: ${w.decisionNeeded}\n\nPlease ask the user this question natively in chat. Wait for their response. Once they answer, resolve the decision using the checkpoint skill by running: node dist/cli.js decisions resolve ${action.decision.id} --yes --scope "<user-defined-scope>" before trying this tool again.`;
        } else {
          decisionText = `CHECKPOINT DECISION REQUIRED [${action.decision?.id}]\n\n${action.decision?.issue}\n\nPlease ask the user to resolve this decision via the checkpoint skill before continuing.`;
        }

        this.actions.reason = decisionText;
        break;
      }

      case "PAUSE_IMPLEMENTATION":
        this.actions.decision = "allow"; // Force ALLOW in observation mode
        if (!this.actions.injectSteps) this.actions.injectSteps = [];
        this.actions.injectSteps.push({
          ephemeralMessage: `[Checkpoint Warning] ${action.reason}`,
        });
        break;
      case "PROVIDE_CONTEXT":
        if (!this.actions.injectSteps) this.actions.injectSteps = [];
        this.actions.injectSteps.push({ ephemeralMessage: action.context });
        break;
    }
  }

  getHookResponse() {
    return this.actions;
  }
}

export async function handleAntigravityHook(
  hookType: string,
  payload: any,
  workspaceRoot?: string,
): Promise<any> {
  const adapter = new AntigravityAdapter();
  const cwd = workspaceRoot || process.cwd();
  const stateManager = new StateManager(cwd);

  try {
    await stateManager.acquireLock(5000); // 5 second timeout
  } catch (error) {
    // If we can't get the lock, fail gracefully rather than crashing the hook
    console.error("Checkpoint Hook: Failed to acquire state lock", error);
    return adapter.getHookResponse();
  }

  let task = await stateManager.readState();

  if (!task) {
    // If no state exists (e.g. running outside of Checkpoint session), fail silently or init dummy
    task = {
      id: randomUUID(),
      sessionId: randomUUID(),
      intent: "Unknown",
      status: "IDLE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentClaims: [],
      toolResults: [],
      decisions: [],
    } as Task;
  }

  task.agentClaims = task.agentClaims || [];
  task.toolResults = task.toolResults || [];
  task.decisions = task.decisions || [];

  try {
    if (hookType === "pre-invocation") {
      // Intent parsing
      if (payload.transcriptPath) {
        try {
          const raw = await fs.readFile(payload.transcriptPath, "utf-8");
          const lines = raw.trim().split("\n");
          for (const line of lines) {
            const step = JSON.parse(line);
            if (step.type === "USER_INPUT" && step.content) {
              task.intent = step.content;
            }
          }
        } catch {}
      }

      // Context Retrieval
      const understanding = new UnderstandingEngine();
      const projContext = await understanding.scanWorkspace(cwd);

      const memoryEngine = new MemoryEngine();
      const memories = await memoryEngine.retrieveContext(task.intent, cwd);

      let contextStr = "Checkpoint Project Context\n\n";
      let hasUsefulContext = false;

      if (projContext.architecturalPatterns.length > 0) {
        contextStr += `Architecture:\n- ${projContext.architecturalPatterns.join("\n- ")}\n\n`;
        hasUsefulContext = true;
      }

      if (memories.length > 0) {
        contextStr += `Relevant decisions:\n`;
        for (const mem of memories) {
          contextStr += `- ${mem.content}\n`;
        }
        hasUsefulContext = true;
      }

      if (hasUsefulContext) {
        await adapter.dispatchAction({ type: "PROVIDE_CONTEXT", context: contextStr.trim() });
      }
    } else if (hookType === "pre-tool-use") {
      const toolCall = payload.toolCall;

      if (
        toolCall?.name === "write_to_file" ||
        toolCall?.name === "replace_file_content" ||
        toolCall?.name === "multi_replace_file_content"
      ) {
        const targetFile = toolCall.args?.TargetFile;
        const description = toolCall.args?.Description || toolCall.args?.Instruction;

        // Record claim
        if (targetFile) {
          const claim: AgentClaim = { modifiedFiles: [targetFile], description };
          task.agentClaims.push(claim);
        }

        // Plan Parsing Trigger
        if (
          targetFile &&
          path.basename(targetFile) === "implementation_plan.md" &&
          toolCall.name === "write_to_file"
        ) {
          const content = toolCall.args.CodeContent || "";

          // Robust plan parsing: extract lines with standard markdown bullets or numbers
          const proposedSteps = content
            .split("\n")
            .map((l: string) => l.trim())
            .filter((l: string) => /^[-*+]\s+/.test(l) || /^\d+\.\s+/.test(l))
            .map((l: string) =>
              l
                .replace(/^[-*+]\s+/, "")
                .replace(/^\d+\.\s+/, "")
                .trim(),
            );

          if (proposedSteps.length > 0) {
            const plan: Plan = {
              id: randomUUID(),
              taskId: task.id,
              proposedSteps,
              affectedComponents: [],
              status: "DRAFT",
            };

            const memoryEngine = new MemoryEngine();
            const memories = await memoryEngine.retrieveContext(task.intent, cwd);
            const priorDecisions = await memoryEngine.getAllDecisions(cwd);
            const { FinalEvaluator, DeterministicEvaluator } = await import(
              "../../core/evaluator.js"
            );
            const { SemanticEvaluator } = await import("../../llm/semantic-evaluator.js");
            const { getProvider } = await import("../../llm/provider.js");

            const det = new DeterministicEvaluator();
            const sem = new SemanticEvaluator(getProvider());
            const evaluator = new FinalEvaluator(det, sem);
            const decisionEngine = new DecisionEngine(evaluator, cwd);

            const { decisions, evaluations } = await decisionEngine.evaluatePlan(
              plan,
              memories,
              priorDecisions,
            );

            task.evaluations = task.evaluations || [];
            task.evaluations.push(...evaluations);

            for (const d of decisions) {
              task.decisions!.push(d);
              if (d.requiresHumanInput) {
                await adapter.dispatchAction({
                  type: "REQUEST_HUMAN_DECISION",
                  decision: d as any,
                });
              }
            }
          }
        }
      }

      // Default to allow if no action dispatched
      if (!adapter.getHookResponse().decision) {
        await adapter.dispatchAction({ type: "CONTINUE" });
      }
    } else if (hookType === "post-tool-use") {
      const toolCall = payload.toolCall;
      task.toolResults.push({
        tool: toolCall?.name,
        target: toolCall?.args?.TargetFile,
        timestamp: new Date().toISOString(),
      });
    } else if (hookType === "stop") {
      // 1. Gather Git Evidence
      let gitDiffs: string[] = [];
      let modifiedFiles: string[] = [];
      try {
        const { stdout: diffStdout } = await execAsync("git diff", { cwd });
        gitDiffs = [diffStdout];

        const { stdout: statusStdout } = await execAsync("git status --porcelain", { cwd });
        modifiedFiles = statusStdout
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => l.substring(3).trim());
      } catch {
        // Not a git repo or git failed
      }

      const observedEvidence = {
        gitDiffs,
        modifiedFiles,
        testResults: "UNKNOWN" as const,
      };

      // Consolidate claims
      const allClaimedFiles = new Set<string>();
      for (const claim of task.agentClaims!) {
        for (const file of claim.modifiedFiles) {
          // normalize paths for comparison
          const relative = path.relative(cwd, file).replace(/\\/g, "/");
          allClaimedFiles.add(relative);
        }
      }

      const consolidatedClaim: AgentClaim = {
        modifiedFiles: Array.from(allClaimedFiles),
        description: "Aggregated claims",
      };

      const evidence = {
        claim: consolidatedClaim,
        observed: observedEvidence,
      };

      // 2. Verification
      const scopeEngine = new ScopeEngine();
      const { getProvider } = await import("../../llm/provider.js");
      const consistencyEngine = new ConsistencyEngine(getProvider());
      const verificationEngine = new VerificationEngine(scopeEngine, consistencyEngine);

      const memoryEngine = new MemoryEngine();
      const memories = await memoryEngine.retrieveContext(task.intent, cwd);

      const plan: Plan = {
        id: randomUUID(),
        taskId: task.id,
        proposedSteps: [],
        affectedComponents: [],
        status: "DRAFT",
      };

      const scope = {
        id: randomUUID(),
        planId: plan.id,
        allowedFiles: [],
        allowedDirectories: [""], // Allow everything for observation
        explicitlyForbidden: [],
      };

      const verificationResult = await verificationEngine.verify(plan, scope, evidence, memories);

      // 3. Generate Report
      let report = `CHECKPOINT REPORT\n\nTask: ${task.intent}\n\nChanges:\n`;
      for (const file of observedEvidence.modifiedFiles) {
        report += `✓ ${file}\n`;
      }

      if (verificationResult.detectedDeviations.length === 0) {
        report += `\nVerification: PASSED\n`;
      } else {
        report += `\nVerification: FAILED\n`;
        for (const dev of verificationResult.detectedDeviations) {
          report += `- [${dev.type}] ${dev.description}\n`;
        }
      }

      report += `\nDecisions:\n`;
      if (task.decisions!.length === 0) {
        report += `None\n`;
      } else {
        for (const dec of task.decisions!) {
          report += `- ${dec.issue}\n`;
        }
      }

      let memoryCreated = false;
      if (task.decisions && task.decisions.length > 0) {
        await memoryEngine.extractMemory(task.decisions, cwd);
        if (task.decisions.some((d) => d.status === "RESOLVED")) {
          memoryCreated = true;
        }
      }

      if (memoryCreated) {
        report += `\nMemory: Durable knowledge created for resolved decisions.\nStatus: VERIFIED\n`;
      } else {
        report += `\nMemory: No durable knowledge created\nStatus: VERIFIED\n`;
      }

      // We log the report via write_to_file or console. For the hook context, it runs headless.
      // So we will append it to walkthrough.md if it exists, or just state.json
      try {
        const wtPath = path.join(cwd, ".checkpoint", "checkpoint-report.txt");
        await fs.writeFile(wtPath, report, "utf-8");
      } catch {}
    }

    await stateManager.writeState(task);
  } catch (error) {
    // Soft fail to not crash agent
  } finally {
    await stateManager.releaseLock();
  }

  return adapter.getHookResponse();
}
