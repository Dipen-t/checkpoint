import { randomUUID } from "node:crypto";
import type { FinalEvaluator } from "../../core/evaluator.js";
import { Ledger } from "../../ledger/chain.js";
import type { Decision } from "../../models/decision.js";
import type { Memory } from "../../models/memory.js";
import type { Plan } from "../../models/plan.js";
import type { Conflict } from "../../models/verification.js";

export interface IDecisionEngine {
  evaluatePlan(
    plan: Plan,
    memories: Memory[],
    priorDecisions: Decision[],
  ): Promise<{ decisions: Decision[]; evaluations: any[] }>;
}

export class DecisionEngine implements IDecisionEngine {
  constructor(
    private evaluator: FinalEvaluator,
    private workspaceRoot?: string,
  ) {}

  async evaluatePlan(
    plan: Plan,
    memories: Memory[],
    priorDecisions: Decision[],
  ): Promise<{ decisions: Decision[]; evaluations: any[] }> {
    const decisions: Decision[] = [];
    const evaluations: any[] = [];
    const conflicts = this.detectConflicts(plan, memories);

    for (const conflict of conflicts) {
      const resolution = await this.evaluator.evaluateConflict(conflict, priorDecisions);

      evaluations.push({
        conflict,
        resolution,
        timestamp: new Date().toISOString(),
      });

      if (this.workspaceRoot) {
        const ledger = new Ledger(this.workspaceRoot);
        await ledger.append({
          type: "DECISION_EVALUATED",
          source: "SYSTEM",
          payload: {
            subject: conflict.subject,
            outcome: resolution.type,
            reason: resolution.reason,
            escalateToHuman: resolution.escalateToHuman,
          },
        });
      }

      if (resolution.escalateToHuman) {
        decisions.push({
          id: randomUUID(),
          issue: `Detected potential rule violation: ${conflict.subject}`,
          classification: "ARCHITECTURE",
          requiresHumanInput: true,
          status: "PENDING",
          provenance: {
            reason: resolution.reason,
            evidence: conflict.proposedAction || "",
            existingRule: conflict.rule?.content,
            risk: resolution.risk || "MEDIUM",
            warningDetails: resolution.warningDetails,
          },
        });
      }
    }

    return { decisions, evaluations };
  }

  private detectConflicts(plan: Plan, memories: Memory[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const step of plan.proposedSteps) {
      const lowerStep = step.toLowerCase();

      // Heuristic 1: Security changes (word-boundary matching to reduce false positives)
      // \bauth matches "auth", "authentication", "authorize" but NOT "0auth"
      // Other keywords use full \b...\b boundaries
      const securityPattern =
        /\bauth|\bcredential\b|\bsecret\b|\blogin\b|\bencryption\b|\btoken\b|\bjwt\b|\bpassword\b/i;
      if (securityPattern.test(lowerStep)) {
        conflicts.push({
          id: randomUUID(),
          source: "PLAN",
          subject: step,
          proposedAction: step,
          severity: "CRITICAL",
          confidence: 0.9,
          context: `Security boundary change detected in plan.`,
        });
        continue;
      }

      // Heuristic 2: Data Model changes
      if (
        lowerStep.includes("schema") ||
        lowerStep.includes("migration") ||
        lowerStep.includes("persistence") ||
        lowerStep.includes("database") ||
        lowerStep.includes("sqlite") ||
        lowerStep.includes("postgres") ||
        lowerStep.includes("prisma")
      ) {
        conflicts.push({
          id: randomUUID(),
          source: "PLAN",
          subject: step,
          proposedAction: step,
          severity: "HIGH",
          confidence: 0.8,
          context: `Data model or persistence change detected.`,
        });
        continue; // Evaluate separately, don't double dip
      }

      // Heuristic 3: Dependencies
      if (
        lowerStep.includes("add dependency") ||
        lowerStep.includes("npm install") ||
        lowerStep.includes("package.json")
      ) {
        conflicts.push({
          id: randomUUID(),
          source: "PLAN",
          subject: step,
          proposedAction: step,
          severity: "LOW",
          confidence: 0.7,
          context: `Dependency change detected.`,
        });
      }

      // Heuristic 4: Architecture matches
      for (const memory of memories) {
        if (memory.type === "ARCHITECTURE") {
          // If memory bans something or defines a boundary, and step mentions it
          // A real semantic engine would use cosine similarity. Here we do deterministic heuristics.
          if (
            (memory.content.toLowerCase().includes("repository") &&
              lowerStep.includes("repository")) ||
            (memory.content.toLowerCase().includes("cli") && lowerStep.includes("cli")) ||
            (memory.content.toLowerCase().includes("business logic") &&
              (lowerStep.includes("logic") || lowerStep.includes("core")))
          ) {
            conflicts.push({
              id: randomUUID(),
              source: "PLAN",
              subject: step,
              proposedAction: step,
              rule: memory,
              severity: "MEDIUM",
              confidence: 0.8,
              context: `Plan relates to architectural memory.`,
            });
          }
        }

        // Match conventions
        if (memory.type === "CONVENTION" && lowerStep.includes("npm")) {
          conflicts.push({
            id: randomUUID(),
            source: "PLAN",
            subject: step,
            proposedAction: step,
            rule: memory,
            severity: "LOW",
            confidence: 0.8,
            context: `Plan relates to convention memory.`,
          });
        }
      }
    }

    return conflicts;
  }
}
