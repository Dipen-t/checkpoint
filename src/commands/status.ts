import { StateManager } from "../core/state.js";

export async function statusCommand() {
  const cwd = process.cwd();
  const stateManager = new StateManager(cwd);
  
  try {
    const task = await stateManager.readState();
    if (!task) {
      console.log("No active Checkpoint session found. Run 'checkpoint init'.");
      return;
    }
    
    console.log("CHECKPOINT STATUS\n");
    console.log(`Task:`);
    console.log(`${task.intent || "Unknown"}\n`);
    
    console.log(`Phase:`);
    console.log(`${task.status}\n`);
    
    console.log(`Scope:`);
    console.log(`Local Workspace\n`);
    
    const pendingDecisions = task.decisions ? task.decisions.filter((d: any) => d.status === "PENDING").length : 0;
    const resolvedDecisions = task.decisions ? task.decisions.filter((d: any) => d.status === "RESOLVED").length : 0;
    console.log(`Decisions:`);
    console.log(`${pendingDecisions} pending, ${resolvedDecisions} resolved\n`);
    
    const conflicts = task.evaluations ? task.evaluations.length : 0;
    console.log(`Conflicts:`);
    console.log(`${conflicts} evaluated\n`);
    
    console.log(`Verification:`);
    console.log(`${task.agentClaims?.length || 0} claims recorded\n`);
    
    // Determine risk based on recent evaluations
    let risk = "LOW";
    if (task.evaluations && task.evaluations.length > 0) {
      const lastEval = task.evaluations[task.evaluations.length - 1];
      if (lastEval.resolution.escalateToHuman) {
        risk = lastEval.resolution.risk || "HIGH";
      }
    }
    console.log(`Risk:`);
    console.log(`${risk}\n`);
    
  } catch (err) {
    console.error("Could not read Checkpoint state.");
  }
}
