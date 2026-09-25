import { StateManager } from "../core/state.js";
import { MemoryEngine } from "../engines/memory/index.js";
import { UnderstandingEngine } from "../engines/understanding/index.js";

export async function rootCommand() {
  const cwd = process.cwd();
  const stateManager = new StateManager(cwd);

  try {
    const task = await stateManager.readState();
    if (!task) {
      console.log("No active Checkpoint session. Run 'checkpoint init'.");
      return;
    }

    console.log("CHECKPOINT\n");

    console.log("Task:");
    console.log(task.intent || "Unknown task");
    console.log();

    const understanding = new UnderstandingEngine();
    const projContext = await understanding.scanWorkspace(cwd);

    console.log("Understanding:");
    if (projContext.architecturalPatterns.length > 0) {
      console.log(projContext.architecturalPatterns.join("\n"));
    } else {
      console.log("No specific architectural patterns detected.");
    }
    console.log();

    const memoryEngine = new MemoryEngine();
    const decisions = await memoryEngine.getAllDecisions(cwd);

    console.log("Relevant decisions:");
    if (decisions.length === 0) {
      console.log("None");
    } else {
      for (const decision of decisions) console.log(`✓ ${decision.resolution}`);
    }
    console.log();

    let risk = "LOW";
    if (task.evaluations && task.evaluations.length > 0) {
      const lastEval = task.evaluations[task.evaluations.length - 1];
      if (lastEval.resolution.escalateToHuman) {
        risk = lastEval.resolution.risk || "HIGH";
      }
    }
    console.log("Current risk:");
    console.log(risk);
    console.log();

    const pending = task.decisions
      ? task.decisions.filter((d: any) => d.status === "PENDING" && d.requiresHumanInput)
      : [];
    if (pending.length > 0) {
      console.log("Potential decision:");
      console.log(pending[0].issue);
      console.log("\nBlocking decision currently required.");
    } else {
      console.log("Potential decision:");
      console.log("None identified.");
      console.log("\nNo blocking decision currently required.");
    }
  } catch (err) {
    console.error("Failed to evaluate Checkpoint context.");
  }
}
