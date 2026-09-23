import { z } from "zod";

export const DecisionClassificationSchema = z.enum([
  "ARCHITECTURE",
  "SECURITY",
  "CONVENTION",
  "DATA_MODEL",
  "SCOPE",
]);

import { WarningDetailsSchema } from "./verification.js";

export const DecisionProvenanceSchema = z.object({
  reason: z.string(),
  evidence: z.string(),
  existingRule: z.string().optional(),
  risk: z.string(),
  warningDetails: WarningDetailsSchema.optional(),
});

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  issue: z.string(),
  resolution: z.string().optional(),
  rationale: z.string().optional(),
  classification: DecisionClassificationSchema,
  requiresHumanInput: z.boolean(),
  status: z.enum(["PENDING", "RESOLVED", "STALE"]),
  provenance: DecisionProvenanceSchema.optional(),
  scopedTo: z.array(z.string()).optional(), // specific contexts or files this decision applies to
  question: z.string().optional(),
  answer: z.string().optional(),
  timestamp: z.string().optional(),
  supersedes: z.string().uuid().optional(),
});

export type DecisionClassification = z.infer<typeof DecisionClassificationSchema>;
export type DecisionProvenance = z.infer<typeof DecisionProvenanceSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
