import { z } from "zod";

export const PlanStatusSchema = z.enum(["DRAFT", "APPROVED", "REJECTED"]);

export const PlanSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  proposedSteps: z.array(z.string()),
  affectedComponents: z.array(z.string()),
  status: PlanStatusSchema,
});

export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type Plan = z.infer<typeof PlanSchema>;
