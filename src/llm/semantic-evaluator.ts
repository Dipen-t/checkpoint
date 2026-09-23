import type { Conflict, Resolution } from "../models/verification.js";
import { SemanticEvaluationSchema } from "../models/evaluation.js";
import type { ILlmProvider } from "./provider.js";

export class SemanticEvaluator {
  constructor(private provider: ILlmProvider) {}

  async evaluate(conflict: Conflict): Promise<Resolution | null> {
    const prompt = this.buildPrompt(conflict);

    try {
      const evaluation = await this.provider.evaluate(prompt, SemanticEvaluationSchema);

      if (evaluation.confidence === "INSUFFICIENT_CONTEXT") {
        return null; // Fallback to deterministic
      }

      if (!evaluation.conflictDetected) {
        return {
          type: "NO_CONFLICT",
          reason: evaluation.reasoning,
          escalateToHuman: false,
        };
      }

      if (evaluation.requiresHumanInput) {
        return {
          type: "HUMAN_DECISION_REQUIRED",
          reason: evaluation.reasoning,
          escalateToHuman: true,
          risk: evaluation.risk,
          warningDetails: {
            what: `Semantic analysis flagged an issue with: "${conflict.subject}"`,
            why: evaluation.reasoning,
            evidence: evaluation.evidenceReferences.join(", "),
            decisionNeeded: "Review this semantic architecture conflict."
          }
        };
      }

      // If it detected a conflict but determined it was an acceptable exception
      return {
        type: "ACCEPTED_EXCEPTION",
        reason: evaluation.reasoning,
        escalateToHuman: false,
      };

    } catch (e) {
      // If validation fails or provider throws, fallback gracefully
      return null;
    }
  }

  private buildPrompt(conflict: Conflict): string {
    let prompt = `
Evaluate the following proposed implementation step against the project context.
You must determine if there is a semantic conflict.

PROPOSED ACTION:
${conflict.proposedAction || conflict.subject}

CONTEXT/INTENT:
${conflict.context}
`;

    if (conflict.rule) {
      prompt += `
RELEVANT ARCHITECTURE/RULE MEMORY:
${conflict.rule.content}
(Confidence: ${conflict.rule.confidence})

IMPORTANT RULES FOR CONFIDENCE LEVELS:
- CONFIRMED: These are strict rules. If the proposed action violates this, flag it as a conflict.
- INFERRED: These are observed patterns in the legacy codebase, but they are NOT yet strictly confirmed by a human. If the proposed action contradicts an INFERRED pattern, you MUST flag it as a conflict and set \`requiresHumanInput: true\` so the human can explicitly confirm or deny the pattern.
`;
    }

    prompt += `
Respond ONLY with JSON matching the SemanticEvaluationSchema.
`;
    return prompt;
  }
}
