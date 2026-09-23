import { StateManager } from "../core/state.js";

export async function explainCommand() {
  const cwd = process.cwd();
  const stateManager = new StateManager(cwd);
  
  try {
    const task = await stateManager.readState();
    if (!task) {
      console.log("No active Checkpoint session found.");
      return;
    }
    
    if (!task.evaluations || task.evaluations.length === 0) {
      console.log("CHECKPOINT EXPLANATION\n");
      console.log("No architectural evaluations have occurred in the current task yet.");
      return;
    }

    console.log("CHECKPOINT EXPLANATION\n");
    
    // Explain the most recent evaluation
    const lastEval = task.evaluations[task.evaluations.length - 1];
    
    console.log(`Decision:`);
    console.log(lastEval.resolution.type);
    console.log();
    
    console.log(`Reason:`);
    console.log(lastEval.resolution.reason);
    console.log();
    
    console.log(`Evidence:`);
    console.log(lastEval.conflict.proposedAction || lastEval.conflict.subject);
    console.log();
    
    if (lastEval.conflict.rule) {
      console.log(`Existing rule/decision:`);
      console.log(lastEval.conflict.rule.content);
      console.log();
    }
    
    if (lastEval.resolution.warningDetails) {
      console.log(`Why it wasn't silently allowed:`);
      console.log(lastEval.resolution.warningDetails.why);
    } else if (lastEval.resolution.type === "FOLLOW_EXISTING_DECISION") {
      console.log(`Why it was silently allowed:`);
      console.log("The action matches an existing resolved decision in the project memory.");
    } else {
      console.log(`Why it was silently allowed:`);
      console.log("The proposed action did not conflict with any known rules or heuristics.");
    }

    console.log();
  } catch (err) {
    console.error("Could not read Checkpoint state.", err);
  }
}
