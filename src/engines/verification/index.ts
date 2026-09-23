import type { Plan } from "../../models/plan.js";
import type { Scope } from "../../models/scope.js";
import type { Verification, Evidence, Deviation } from "../../models/verification.js";
import type { IScopeEngine } from "../scope/index.js";
import type { IConsistencyEngine } from "../consistency/index.js";
import type { Memory } from "../../models/memory.js";
import { randomUUID } from "node:crypto";

export interface IVerificationEngine {
  verify(plan: Plan, scope: Scope, evidence: Evidence, memories: Memory[]): Promise<Verification>;
}

export class VerificationEngine implements IVerificationEngine {
  constructor(
    private scopeEngine: IScopeEngine,
    private consistencyEngine: IConsistencyEngine
  ) {}

  async verify(plan: Plan, scope: Scope, evidence: Evidence, memories: Memory[]): Promise<Verification> {
    const claimDeviations = this.verifyClaimsVsObserved(evidence);
    const scopeDeviations = this.scopeEngine.evaluateEvidence(scope, evidence);
    const consistencyDeviations = await this.consistencyEngine.evaluateEvidence(evidence, memories);

    const deviations = [...claimDeviations, ...scopeDeviations, ...consistencyDeviations];

    let status: "PASSED" | "FAILED" | "REQUIRES_REVIEW" = "PASSED";

    if (deviations.some(d => d.severity === "CRITICAL")) {
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
}
