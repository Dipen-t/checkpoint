import { z } from "zod";
import { MemorySchema } from "./memory.js";

export const DeviationTypeSchema = z.enum([
  "SCOPE",
  "ARCHITECTURE",
  "SECURITY",
  "EVIDENCE_MISMATCH",
]);

export const DeviationSchema = z.object({
  type: DeviationTypeSchema,
  description: z.string(),
  severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]),
});

export const AgentClaimSchema = z.object({
  modifiedFiles: z.array(z.string()),
  description: z.string().optional(),
});

export const ObservedEvidenceSchema = z.object({
  gitDiffs: z.array(z.string()),
  modifiedFiles: z.array(z.string()),
  testResults: z.enum(["PASSED", "FAILED", "UNKNOWN"]),
});

export const EvidenceSchema = z.object({
  claim: AgentClaimSchema,
  observed: ObservedEvidenceSchema,
});

export const VerificationStatusSchema = z.enum(["PASSED", "FAILED", "REQUIRES_REVIEW"]);

export const VerificationSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  planId: z.string().uuid(),
  evidence: EvidenceSchema,
  detectedDeviations: z.array(DeviationSchema),
  status: VerificationStatusSchema,
});

export const ConflictSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const ConflictSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["PLAN", "EVIDENCE"]),
  subject: z.string(), // e.g. "src/controllers/user.controller.ts"
  rule: MemorySchema.optional(), // The memory/rule involved
  observedEvidence: z.string().optional(),
  proposedAction: z.string().optional(),
  severity: ConflictSeveritySchema,
  confidence: z.number().min(0).max(1),
  context: z.string(),
});

export const ResolutionTypeSchema = z.enum([
  "NO_CONFLICT",
  "AUTO_RESOLVE",
  "HUMAN_DECISION_REQUIRED",
  "ACCEPTED_EXCEPTION",
  "OVERRIDE_EXISTING_MEMORY",
  "FOLLOW_EXISTING_DECISION",
]);

export const WarningDetailsSchema = z.object({
  what: z.string(),
  why: z.string(),
  evidence: z.string(),
  decisionNeeded: z.string(),
});

export const ResolutionSchema = z.object({
  type: ResolutionTypeSchema,
  reason: z.string(),
  escalateToHuman: z.boolean(),
  risk: ConflictSeveritySchema.optional(),
  warningDetails: WarningDetailsSchema.optional(),
});

export type DeviationType = z.infer<typeof DeviationTypeSchema>;
export type Deviation = z.infer<typeof DeviationSchema>;
export type AgentClaim = z.infer<typeof AgentClaimSchema>;
export type ObservedEvidence = z.infer<typeof ObservedEvidenceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;
export type Conflict = z.infer<typeof ConflictSchema>;
export type ResolutionType = z.infer<typeof ResolutionTypeSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type WarningDetails = z.infer<typeof WarningDetailsSchema>;
