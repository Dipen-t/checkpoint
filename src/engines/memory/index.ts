import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Decision } from "../../models/decision.js";
import { type Memory, MemorySchema } from "../../models/memory.js";

export interface IMemoryEngine {
  retrieveContext(intent: string, workspaceRoot: string): Promise<Memory[]>;
  getAllMemories(workspaceRoot: string): Promise<Memory[]>;
  extractMemory(decisions: Decision[], workspaceRoot: string): Promise<void>;
  getAllDecisions(workspaceRoot: string): Promise<Decision[]>;
}

export class MemoryEngine implements IMemoryEngine {
  async retrieveContext(intent: string, workspaceRoot: string): Promise<Memory[]> {
    const memoryDir = path.join(workspaceRoot, ".checkpoint", "memory");
    const allMemories: Memory[] = [];
    const stopWords = new Set([
      "the",
      "and",
      "this",
      "that",
      "with",
      "from",
      "your",
      "what",
      "how",
      "when",
      "where",
      "who",
      "why",
      "are",
      "for",
      "not",
      "but",
      "all",
      "any",
      "can",
      "has",
      "have",
      "had",
      "was",
      "were",
      "add",
      "update",
      "delete",
      "create",
    ]);

    try {
      const files = await fs.readdir(memoryDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
        const parsed = MemorySchema.safeParse(JSON.parse(content));

        if (parsed.success) {
          allMemories.push(parsed.data);
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        throw e; // properly throw if it's not a missing directory
      }
    }

    const { BM25 } = await import("./bm25.js");

    // We create the corpus from all non-prioritized memory contents
    // Actually, BM25 handles all documents, we just add score bonuses later
    const contents = allMemories.map((m) => m.content);
    const bm25 = new BM25(contents);

    const scoredMemories = allMemories.map((memory, index) => {
      let score = bm25.score(intent, index);
      if (memory.type === "CONSTITUTION" || memory.type === "ARCHITECTURE") {
        score += 1000; // Always prioritize core memories
      }
      return { memory, score };
    });

    // Filter out zero-score CONVENTION memories and sort by score descending
    const relevantMemories = scoredMemories
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // Limit to top 10 relevant memories
      .map((m) => m.memory);

    return relevantMemories;
  }

  async getAllMemories(workspaceRoot: string): Promise<Memory[]> {
    const memoryDir = path.join(workspaceRoot, ".checkpoint", "memory");
    const memories: Memory[] = [];

    try {
      const files = await fs.readdir(memoryDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
        const parsed = MemorySchema.safeParse(JSON.parse(content));

        if (parsed.success) {
          memories.push(parsed.data);
        }
      }
    } catch (e) {
      // Directory might not exist yet
    }

    return memories;
  }

  async extractMemory(decisions: Decision[], workspaceRoot: string): Promise<void> {
    const memoryDir = path.join(workspaceRoot, ".checkpoint", "memory");

    try {
      await fs.mkdir(memoryDir, { recursive: true });
    } catch {
      // Ignore if exists
    }

    for (const decision of decisions) {
      if (decision.status !== "RESOLVED" || !decision.resolution) continue;

      const memory: Memory = {
        id: randomUUID(),
        type: "CONVENTION", // Or ARCHITECTURE based on classification
        content: `Decision resolved: ${decision.issue} -> ${decision.resolution}`,
        confidence: "CONFIRMED",
        provenance: decision.id,
        scopedTo: decision.scopedTo,
      };

      if (decision.classification === "ARCHITECTURE") {
        memory.type = "ARCHITECTURE";
      }

      await fs.writeFile(
        path.join(memoryDir, `${memory.id}.json`),
        JSON.stringify(memory, null, 2),
        "utf-8",
      );
    }
  }
  async getAllDecisions(workspaceRoot: string): Promise<Decision[]> {
    const decisionDir = path.join(workspaceRoot, ".checkpoint", "decisions");
    const decisions: Decision[] = [];

    try {
      const files = await fs.readdir(decisionDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await fs.readFile(path.join(decisionDir, file), "utf-8");
        const data = JSON.parse(content);
        if (data.id && data.issue) {
          decisions.push(data as Decision);
        }
      }
    } catch (e) {
      // Directory might not exist yet
    }

    return decisions;
  }
}
