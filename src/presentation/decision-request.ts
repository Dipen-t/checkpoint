import type { Decision } from "../models/decision.js";

export class DecisionPresenter {
  static formatRequest(decision: Decision): string {
    let output = `CHECKPOINT — DECISION REQUIRED [${decision.id}]\n\n`;
    output += `${decision.issue}\n\n`;

    if (decision.provenance?.warningDetails) {
      output += `Why:\n${decision.provenance.warningDetails.what}\n\n`;
      if (decision.provenance.existingRule) {
        output += `Existing convention:\n${decision.provenance.existingRule}\n\n`;
      }
      output += `Evidence:\n${decision.provenance.warningDetails.evidence}\n\n`;
    } else {
      // Fallback
      output += `Why:\n${decision.provenance?.reason || "Significant architecture change detected."}\n\n`;
      if (decision.provenance?.evidence) {
        output += `Evidence:\n${decision.provenance.evidence}\n\n`;
      }
    }

    output += `Risk:\n${decision.provenance?.risk || "UNKNOWN"}\n\n`;

    output += `Question:\n${decision.question || "Should this intentionally bypass the existing architecture?"}\n`;

    return output;
  }
}
