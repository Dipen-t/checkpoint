import type { Scope } from "../../models/scope.js";
import type { Evidence, Deviation } from "../../models/verification.js";

export interface IScopeEngine {
  evaluateEvidence(scope: Scope, evidence: Evidence): Deviation[];
}

export class ScopeEngine implements IScopeEngine {
  evaluateEvidence(scope: Scope, evidence: Evidence): Deviation[] {
    const deviations: Deviation[] = [];

    for (const file of evidence.observed.modifiedFiles) {
      let isAllowed = false;
      for (const dir of scope.allowedDirectories) {
        if (file.startsWith(dir)) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed && !scope.allowedFiles.includes(file)) {
        deviations.push({
          type: "SCOPE",
          description: `Modified file ${file} is outside the approved scope.`,
          severity: "MAJOR",
        });
      }
    }

    return deviations;
  }
}
