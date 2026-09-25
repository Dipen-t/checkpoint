import { promises as fs } from "node:fs";
import * as path from "node:path";
import { type Task, TaskSchema } from "../models/task.js";

export class StateManager {
  private readonly statePath: string;
  private readonly tmpPath: string;

  constructor(workspaceRoot: string) {
    const checkpointDir = path.join(workspaceRoot, ".checkpoint");
    this.statePath = path.join(checkpointDir, "state.json");
    this.tmpPath = path.join(checkpointDir, "state.tmp.json");
  }

  /**
   * Initializes the .checkpoint directory if it doesn't exist.
   */
  async init(): Promise<void> {
    const dir = path.dirname(this.statePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Safely reads the current task state.
   */
  async readState(): Promise<Task | null> {
    try {
      const content = await fs.readFile(this.statePath, "utf-8");

      // Handle empty file gracefully
      if (!content.trim()) {
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Corrupt or malformed JSON — treat as no state
        console.warn("State file contains invalid JSON, treating as empty.");
        return null;
      }

      // If it's the initial scaffolded state from `checkpoint init`, return null
      // without logging a Zod validation error.
      if (parsed && parsed.status === "IDLE" && parsed.taskId === null) {
        return null;
      }

      const result = TaskSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      console.warn("State file failed validation:", result.error);
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Atomically writes the state to disk using a temporary file.
   */
  async writeState(task: Task): Promise<void> {
    const content = JSON.stringify(task, null, 2);
    // Write to a temporary file first
    await fs.writeFile(this.tmpPath, content, "utf-8");
    // Rename to perform an atomic write
    await fs.rename(this.tmpPath, this.statePath);
  }

  /**
   * Acquires a lock on the state file to prevent concurrent modifications.
   */
  async acquireLock(timeoutMs: number = 5000): Promise<void> {
    const lockPath = path.join(path.dirname(this.statePath), "state.lock");
    const start = Date.now();
    const waitTime = 50; // ms

    while (Date.now() - start < timeoutMs) {
      try {
        await fs.mkdir(lockPath);
        return; // Lock acquired
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          // Lock exists, wait and retry
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          // Parent dir doesn't exist, try initializing it
          await this.init();
        } else {
          throw error;
        }
      }
    }
    throw new Error(`Failed to acquire lock on ${lockPath} after ${timeoutMs}ms`);
  }

  /**
   * Releases the lock on the state file.
   */
  async releaseLock(): Promise<void> {
    const lockPath = path.join(path.dirname(this.statePath), "state.lock");
    try {
      await fs.rmdir(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Failed to release lock at ${lockPath}:`, error);
      }
    }
  }
}
