import type { Task, TaskStatus } from "../models/task.js";
import type { Event } from "../models/event.js";
import type { StateManager } from "./state.js";

/**
 * Defines valid transitions based on the minimal bureaucracy state machine.
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  IDLE: ["DISCOVERY"],
  DISCOVERY: ["UNDERSTANDING"],
  UNDERSTANDING: ["INVESTIGATION"],
  INVESTIGATION: ["PLAN"],
  PLAN: ["DECISION_REQUIRED", "IMPLEMENTING"],
  DECISION_REQUIRED: ["IMPLEMENTING", "MEMORY_EXTRACTION"],
  IMPLEMENTING: ["PLAN_CHANGE_DETECTED", "VERIFICATION"],
  PLAN_CHANGE_DETECTED: ["DECISION_REQUIRED", "IMPLEMENTING"],
  VERIFICATION: ["REVIEW", "MEMORY_EXTRACTION"],
  REVIEW: ["MEMORY_EXTRACTION", "IMPLEMENTING"],
  MEMORY_EXTRACTION: ["COMPLETED"],
  COMPLETED: [],
};

export class WorkflowEngine {
  constructor(private stateManager: StateManager) {}

  /**
   * Orchestrates a state transition, ensuring it's valid according to the machine rules.
   */
  async transition(task: Task, targetStatus: TaskStatus, eventPayload?: any): Promise<Task> {
    const validNextStates = VALID_TRANSITIONS[task.status];
    if (!validNextStates.includes(targetStatus)) {
      throw new Error(`Invalid transition from ${task.status} to ${targetStatus}`);
    }

    const updatedTask: Task = {
      ...task,
      status: targetStatus,
      updatedAt: new Date().toISOString(),
    };

    await this.stateManager.writeState(updatedTask);
    
    // In the future, this is where we would emit the relevant Domain Event to the rest of the system.
    return updatedTask;
  }
}
