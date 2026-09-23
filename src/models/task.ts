import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "IDLE",
  "DISCOVERY",
  "UNDERSTANDING",
  "INVESTIGATION",
  "PLAN",
  "DECISION_REQUIRED",
  "IMPLEMENTING",
  "PLAN_CHANGE_DETECTED",
  "VERIFICATION",
  "REVIEW",
  "MEMORY_EXTRACTION",
  "COMPLETED",
]);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  intent: z.string(),
  status: TaskStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  agentClaims: z.array(z.any()).optional(), // We use any to avoid cyclic imports or deep schema trees here
  toolResults: z.array(z.any()).optional(),
  decisions: z.array(z.any()).optional(),
  evaluations: z.array(z.any()).optional(),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
