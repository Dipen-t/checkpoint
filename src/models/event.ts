import { z } from "zod";

export const EventSourceSchema = z.enum(["AGENT", "SYSTEM", "HUMAN"]);

export const EventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(), // e.g. TASK_CREATED, FILE_CHANGED, DECISION_RESOLVED
  timestamp: z.string().datetime(),
  source: EventSourceSchema,
  payload: z.record(z.any()), // flexible payload for different event types
});

export type EventSource = z.infer<typeof EventSourceSchema>;
export type Event = z.infer<typeof EventSchema>;
