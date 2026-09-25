import type { ILlmProvider } from "../../llm/provider.js";
import { ConsistencyEvaluationSchema } from "../../models/evaluation.js";
import type { Memory } from "../../models/memory.js";
import type { Deviation, Evidence } from "../../models/verification.js";

export interface IConsistencyEngine {
  evaluateEvidence(evidence: Evidence, memories: Memory[]): Promise<Deviation[]>;
}

export class ConsistencyEngine implements IConsistencyEngine {
  constructor(private provider: ILlmProvider) {}

  async evaluateEvidence(evidence: Evidence, memories: Memory[]): Promise<Deviation[]> {
    if (evidence.observed.gitDiffs.length === 0 || memories.length === 0) {
      return [];
    }

    const diffContent = evidence.observed.gitDiffs.join("\n");
    if (!diffContent.trim()) {
      return [];
    }

    const memoryContent = memories
      .map((m) => `[${m.type}] (Confidence: ${m.confidence}) ${m.content}`)
      .join("\n");

    const prompt = `
Evaluate the following code changes (git diff) against the project's Architectural and Conventional memories.
Determine if the code changes violate any of these established rules.

MEMORIES:
${memoryContent}

IMPORTANT RULES FOR CONFIDENCE LEVELS:
- CONFIRMED: These are strict rules. If the git diff violates this, flag it as a deviation.
- INFERRED: These are observed patterns in the codebase, but they are NOT yet strictly confirmed by a human. If the git diff contradicts an INFERRED pattern, you MUST flag it as a deviation so the human can explicitly confirm or deny the pattern.

CODE CHANGES (GIT DIFF):
${diffContent}

Respond ONLY with JSON matching the ConsistencyEvaluationSchema.
`;

    try {
      const evaluation = await this.provider.evaluate(prompt, ConsistencyEvaluationSchema);

      if (evaluation.isConsistent || !evaluation.deviations || evaluation.deviations.length === 0) {
        return [];
      }

      return evaluation.deviations.map((d) => ({
        type: d.type === "CONVENTION" ? ("ARCHITECTURE" as const) : d.type,
        description: d.description,
        severity: d.severity === "LOW" || d.severity === "MEDIUM" ? ("MINOR" as const) : d.severity,
      }));
    } catch (e) {
      console.warn("ConsistencyEngine: check failed. Review is required.", e);
      return [
        {
          type: "ARCHITECTURE",
          description: "The consistency check did not finish. The change needs a human review.",
          severity: "CRITICAL",
        },
      ];
    }
  }
}
