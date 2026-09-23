import { z } from "zod";

export const MemoryTypeSchema = z.enum(["CONSTITUTION", "CONVENTION", "LESSON", "ARCHITECTURE"]);

export const MemoryConfidenceSchema = z.enum(["OBSERVED", "INFERRED", "CONFIRMED"]);

export const MemorySchema = z.object({
  id: z.string().uuid(),
  type: MemoryTypeSchema,
  content: z.string(),
  confidence: MemoryConfidenceSchema,
  provenance: z.string(), // How this memory was obtained (e.g. "DEC-123", "Project Scan")
  scopedTo: z.array(z.string()).optional(),
});

export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type MemoryConfidence = z.infer<typeof MemoryConfidenceSchema>;
export type Memory = z.infer<typeof MemorySchema>;
