import type { Decision } from "../models/decision.js";
import type { Plan } from "../models/plan.js";
import type { Task } from "../models/task.js";
import type { AgentClaim } from "../models/verification.js";

/**
 * Declares what a specific Agent integration is capable of handling.
 * Checkpoint will not attempt to send instructions the agent cannot fulfill.
 */
export interface AgentCapabilities {
  canReceiveContext: boolean;
  canPause: boolean;
  canRequestHumanDecision: boolean;
  canReceivePlanChanges: boolean;
}

/**
 * Standardized events that any Agent Adapter translates into Checkpoint.
 */
export type AgentEvent =
  | { type: "TASK_STARTED"; intent: string }
  | { type: "PLAN_PROPOSED"; plan: Plan }
  | { type: "IMPLEMENTATION_STARTED" }
  | { type: "FILES_CHANGED"; claim: AgentClaim }
  | { type: "IMPLEMENTATION_COMPLETED" }
  | { type: "DECISION_REPORTED"; decision: Decision }
  | { type: "VERIFICATION_REQUESTED" };

/**
 * Actions that Checkpoint can push back to the Agent Adapter.
 */
export type CheckpointAction =
  | { type: "CONTINUE" }
  | { type: "REQUEST_HUMAN_DECISION"; decision: Decision }
  | { type: "PAUSE_IMPLEMENTATION"; reason: string }
  | { type: "PLAN_REJECTED"; reason: string }
  | { type: "VERIFICATION_FAILED"; feedback: string }
  | { type: "PROVIDE_CONTEXT"; context: string };

/**
 * The base interface for an Agent Adapter.
 * Adapters translate proprietary agent streams/hooks into Checkpoint Events,
 * and translate Checkpoint Actions back into agent-specific instructions.
 */
export interface IAgentAdapter {
  getCapabilities(): AgentCapabilities;

  // Method to push an action from Checkpoint to the Agent
  dispatchAction(action: CheckpointAction): Promise<void>;
}
