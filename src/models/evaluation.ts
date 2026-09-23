import { z } from "zod";

export const SemanticEvaluationSchema = z.object({
  conflictDetected: z.boolean(),
  significance: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  requiresHumanInput: z.boolean(),
  reasoning: z.string(),
  evidenceReferences: z.array(z.string()),
  affectedMemory: z.string().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT_CONTEXT"]),
});

export type SemanticEvaluation = z.infer<typeof SemanticEvaluationSchema>;

export const ConsistencyEvaluationSchema = z.object({
  isConsistent: z.boolean(),
  deviations: z.array(z.object({
    type: z.enum(["ARCHITECTURE", "CONVENTION"]),
    description: z.string(),
    severity: z.enum(["LOW", "MEDIUM", "MAJOR", "CRITICAL"])
  }))
});

export type ConsistencyEvaluation = z.infer<typeof ConsistencyEvaluationSchema>;
