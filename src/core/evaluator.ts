import type { Decision } from "../models/decision.js";
import type { Conflict, ConflictSeverity, Resolution } from "../models/verification.js";

export interface IEvaluator {
  evaluateConflict(conflict: Conflict, priorDecisions: Decision[]): Resolution;
}

export class DeterministicEvaluator implements IEvaluator {
  evaluateConflict(conflict: Conflict, priorDecisions: Decision[]): Resolution {
    const action = (conflict.proposedAction || conflict.subject).toLowerCase();

    // Case H: Existing scoped decision
    for (const prior of priorDecisions) {
      if (
        prior.scopedTo &&
        prior.scopedTo.some((scope) => {
          // Use word-boundary matching to prevent partial matches
          // e.g. scope "admin-api" should NOT match action mentioning just "admin"
          const escapedScope = scope.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const scopePattern = new RegExp(`\\b${escapedScope}\\b`, "i");
          return scopePattern.test(action);
        }) &&
        prior.status === "RESOLVED"
      ) {
        return {
          type: "FOLLOW_EXISTING_DECISION",
          reason: `Follows prior scoped decision: ${prior.resolution}`,
          escalateToHuman: false,
        };
      }
    }

    // Case D: Intentional exception
    if (action.includes("formatting helper") || action.includes("migration script")) {
      return {
        type: "ACCEPTED_EXCEPTION",
        reason: "Matches known acceptable exceptions.",
        escalateToHuman: false,
      };
    }

    // Case E: Security
    if (conflict.severity === "CRITICAL" && conflict.context.includes("Security")) {
      return {
        type: "HUMAN_DECISION_REQUIRED",
        reason: "Security-sensitive changes must be reviewed.",
        escalateToHuman: true,
        risk: "CRITICAL",
        warningDetails: {
          what: `The plan introduces a security-sensitive change: "${conflict.subject}"`,
          why: "Changes to auth, credentials, or secrets carry high risk.",
          evidence: "Matched security heuristic in proposed step.",
          decisionNeeded: "Should this security pattern be approved?",
        },
      };
    }

    // Case F: Data Model
    if (conflict.severity === "HIGH" && conflict.context.includes("Data model")) {
      return {
        type: "HUMAN_DECISION_REQUIRED",
        reason: "Data model changes impact global state.",
        escalateToHuman: true,
        risk: "HIGH",
        warningDetails: {
          what: `The plan alters the data model or persistence: "${conflict.subject}"`,
          why: "Schema and migration changes require architectural consensus.",
          evidence: "Matched persistence heuristic in proposed step.",
          decisionNeeded: "Is this persistence change architecturally sound?",
        },
      };
    }

    // Case G: Dependency Change
    if (conflict.severity === "LOW" && conflict.context.includes("Dependency")) {
      // Differentiate: fundamental vs routine
      if (
        action.includes("next") ||
        action.includes("express") ||
        action.includes("react") ||
        action.includes("vue") ||
        action.includes("framework")
      ) {
        return {
          type: "HUMAN_DECISION_REQUIRED",
          reason: "Fundamental dependency change.",
          escalateToHuman: true,
          risk: "HIGH",
          warningDetails: {
            what: `Adding a core structural dependency: "${conflict.subject}"`,
            why: "Core frameworks change the runtime architecture.",
            evidence: "Matched framework heuristic.",
            decisionNeeded: "Should we adopt this new core dependency?",
          },
        };
      }
      return {
        type: "NO_CONFLICT",
        reason: "Routine dependency addition.",
        escalateToHuman: false,
      };
    }

    // Case D: Intentional exception
    if (action.includes("formatting helper") || action.includes("migration script")) {
      return {
        type: "ACCEPTED_EXCEPTION",
        reason: "Matches known acceptable exceptions.",
        escalateToHuman: false,
      };
    }

    // Case C: Architectural deviation
    if (conflict.rule?.type === "ARCHITECTURE") {
      // Look for mixing: e.g. "business logic" in "cli"
      if (
        (action.includes("business logic") && action.includes("cli")) ||
        (action.includes("sqlite") && action.includes("cli")) ||
        (action.includes("prisma") && action.includes("controller"))
      ) {
        return {
          type: "HUMAN_DECISION_REQUIRED",
          reason: "Meaningful architectural deviation.",
          escalateToHuman: true,
          risk: "HIGH",
          warningDetails: {
            what: `The proposed implementation violates the architecture boundary: "${conflict.subject}"`,
            why: conflict.rule.content,
            evidence: `The plan directly contradicts the recorded architectural rule.`,
            decisionNeeded: `Should this component follow the existing boundary?`,
          },
        };
      }

      // Case A: Routine (using existing engines)
      if (
        action.includes("using an existing engine") ||
        action.includes("add a version command") ||
        action.includes("add a new cli command")
      ) {
        return {
          type: "NO_CONFLICT",
          reason: "Routine implementation following architecture.",
          escalateToHuman: false,
        };
      }
    }

    // Case B: Existing convention
    if (conflict.rule?.type === "CONVENTION" && action.includes("npm")) {
      return {
        type: "NO_CONFLICT",
        reason: "Follows existing convention.",
        escalateToHuman: false,
      };
    }

    // A high or critical conflict with no allow rule stays blocked.
    // OWASP agent guidance: fail closed when the check is uncertain.
    if (conflict.severity === "CRITICAL" || conflict.severity === "HIGH") {
      return {
        type: "HUMAN_DECISION_REQUIRED",
        reason: "No allow rule matched this high-impact change.",
        escalateToHuman: true,
        risk: conflict.severity,
        warningDetails: {
          what: `Checkpoint could not clear: "${conflict.subject}"`,
          why: "High-impact changes need an explicit allow rule or a human decision.",
          evidence: conflict.context,
          decisionNeeded: "Should this change go ahead?",
        },
      };
    }

    return {
      type: "NO_CONFLICT",
      reason: "No significant conflict identified.",
      escalateToHuman: false,
    };
  }
}

import type { SemanticEvaluator } from "../llm/semantic-evaluator.js";

export class FinalEvaluator {
  constructor(
    private deterministic: DeterministicEvaluator,
    private semantic: SemanticEvaluator,
  ) {}

  async evaluateConflict(conflict: Conflict, priorDecisions: Decision[]): Promise<Resolution> {
    const detRes = this.deterministic.evaluateConflict(conflict, priorDecisions);

    if (
      detRes.type === "FOLLOW_EXISTING_DECISION" ||
      detRes.type === "ACCEPTED_EXCEPTION" ||
      detRes.type === "NO_CONFLICT"
    ) {
      return detRes;
    }

    const semRes = await this.semantic.evaluate(conflict);

    // A model may explain a block. It may not clear a high or critical block.
    if (
      semRes &&
      !semRes.escalateToHuman &&
      (detRes.risk === "CRITICAL" || detRes.risk === "HIGH")
    ) {
      return detRes;
    }

    if (semRes) {
      return semRes;
    }

    return detRes;
  }
}
