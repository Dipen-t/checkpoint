import { z } from "zod";

export const ScopeSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  allowedFiles: z.array(z.string()),
  allowedDirectories: z.array(z.string()),
  explicitlyForbidden: z.array(z.string()),
});

export type Scope = z.infer<typeof ScopeSchema>;
