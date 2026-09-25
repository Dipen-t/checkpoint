import { randomUUID } from "node:crypto";
import type { Memory } from "../../models/memory.js";
import type { Plan } from "../../models/plan.js";
import type { Scope } from "../../models/scope.js";
import type { Deviation, Evidence, Verification } from "../../models/verification.js";
import type { IConsistencyEngine } from "../consistency/index.js";
import { boundaryDeviations, parseDiffHunks } from "../evidence/diff-policy.js";
import type { IScopeEngine } from "../scope/index.js";

export interface IVerificationEngine {
  verify(plan: Plan, scope: Scope, evidence: Evidence, memories: Memory[]): Promise<Verification>;
}

export class VerificationEngine implements IVerificationEngine {
  constructor(
    private scopeEngine: IScopeEngine,
    private consistencyEngine: IConsistencyEngine,
  ) {}

  async verify(
    plan: Plan,
    scope: Scope,
    evidence: Evidence,
    memories: Memory[],
  ): Promise<Verification> {
    const claimDeviations = this.verifyClaimsVsObserved(evidence);
    const scopeDeviations = this.scopeEngine.evaluateEvidence(scope, evidence);
    const consistencyDeviations = await this.consistencyEngine.evaluateEvidence(evidence, memories);

    const unobservedTests = this.verifyTestsWereObserved(evidence);
    const secretDeviations = this.verifyNoSecretsInDiff(evidence);
    const boundary = boundaryDeviations(
      parseDiffHunks(evidence.observed.gitDiffs, evidence.observed.modifiedFiles),
    );
    const deviations = [
      ...claimDeviations,
      ...scopeDeviations,
      ...consistencyDeviations,
      ...unobservedTests,
      ...secretDeviations,
      ...boundary,
    ];

    let status: "PASSED" | "FAILED" | "REQUIRES_REVIEW" = "PASSED";

    if (deviations.some((d) => d.severity === "CRITICAL")) {
      status = "REQUIRES_REVIEW";
    } else if (deviations.length > 0) {
      status = "FAILED";
    }

    return {
      id: randomUUID(),
      taskId: plan.taskId,
      planId: plan.id,
      evidence,
      detectedDeviations: deviations,
      status,
    };
  }

  private verifyClaimsVsObserved(evidence: Evidence): Deviation[] {
    const deviations: Deviation[] = [];
    const claimFiles = new Set(evidence.claim.modifiedFiles);

    for (const obsFile of evidence.observed.modifiedFiles) {
      if (!claimFiles.has(obsFile)) {
        deviations.push({
          type: "EVIDENCE_MISMATCH",
          description: `Observed modification in '${obsFile}' was not claimed by the agent.`,
          severity: "CRITICAL",
        });
      }
    }

    return deviations;
  }

  private verifyTestsWereObserved(evidence: Evidence): Deviation[] {
    if (evidence.observed.modifiedFiles.length === 0) return [];
    if (evidence.observed.testResults !== "UNKNOWN") return [];
    return [
      {
        type: "EVIDENCE_MISMATCH",
        description: "Files changed, but Checkpoint did not observe a test result.",
        severity: "CRITICAL",
      },
    ];
  }

  private verifyNoSecretsInDiff(evidence: Evidence): Deviation[] {
    const pattern = /(password|api[_-]?key|secret|token)\s*[:=]\s*\S+/i;
    for (const diff of evidence.observed.gitDiffs) {
      if (pattern.test(diff)) {
        return [
          {
            type: "SECURITY",
            description:
              "A diff contains a credential-like assignment. The value was not copied into this record.",
            severity: "CRITICAL",
          },
        ];
      }
    }
    return [];
  }
}
