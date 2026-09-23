import { z } from "zod";

export interface ILlmProvider {
  /**
   * Evaluates a prompt and returns a JSON object matching the provided Zod schema.
   */
  evaluate<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T>;
}

export class FallbackProvider implements ILlmProvider {
  async evaluate<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
    throw new Error("No active LLM provider configured. Falling back to deterministic rules.");
  }
}

export class MockProvider implements ILlmProvider {
  constructor(private mockResponses: Record<string, any>) {}

  async evaluate<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
    // Find the first mock response whose key appears in the prompt
    for (const [key, response] of Object.entries(this.mockResponses)) {
      if (prompt.includes(key)) {
        return schema.parse(response);
      }
    }
    throw new Error("MockProvider: No matching mock response found for prompt.");
  }
}

// In a real implementation, we would have an OpenAIProvider here reading from process.env.
export function getProvider(): ILlmProvider {
  if (process.env.CHECKPOINT_LLM_ENABLED === "true") {
    // Return a real provider if implemented later
    return new FallbackProvider();
  }
  return new FallbackProvider();
}
