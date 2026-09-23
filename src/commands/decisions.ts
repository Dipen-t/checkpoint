import { StateManager } from "../core/state.js";
import { DecisionPresenter } from "../presentation/decision-request.js";
import { MemoryEngine } from "../engines/memory/index.js";
import * as readline from "node:readline/promises";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export async function decisionsCommand(subcommand?: string, id?: string) {
  const cwd = process.cwd();
  const stateManager = new StateManager(cwd);

  const task = await stateManager.readState();
  if (!task || !task.decisions || task.decisions.length === 0) {
    console.log("No pending decisions.");
    return;
  }

  const pending = task.decisions.filter(d => d.status === "PENDING" && d.requiresHumanInput);

  if (!subcommand) {
    const memoryEngine = new MemoryEngine(cwd);
    const activeDecisions = await memoryEngine.getAllDecisions(cwd);

    if (pending.length === 0 && activeDecisions.length === 0) {
      console.log("No pending or active decisions.");
      return;
    }

    console.log("CHECKPOINT DECISIONS\n");
    
    if (pending.length > 0) {
      console.log("PENDING DECISIONS:");
      pending.forEach(d => {
        console.log(`- [${d.id}] ${d.issue}`);
      });
      console.log();
    }
    
    if (activeDecisions.length > 0) {
      console.log("ACTIVE DECISIONS:");
      activeDecisions.forEach(d => {
        console.log(`- Decision: ${d.resolution}`);
        console.log(`  Scope: ${d.scopedTo?.join(", ") || "Global"}`);
        console.log(`  Status: ${d.status}`);
        console.log(`  Rationale: ${d.rationale || "None"}`);
        console.log(`  Provenance: ${d.provenance?.reason || "User resolved"}`);
        console.log();
      });
    }
    return;
  }

  if (subcommand === "resolve") {
    if (!id) {
      console.log("Please provide a decision ID. Example: checkpoint decisions resolve <id>");
      return;
    }

    const decision = pending.find(d => d.id === id);
    if (!decision) {
      console.log(`Decision ${id} not found or already resolved.`);
      return;
    }

    console.log(DecisionPresenter.formatRequest(decision));

    const args = process.argv;
    const isYes = args.includes("--yes");
    const scopeIndex = args.indexOf("--scope");
    const overrideScope = scopeIndex > -1 ? args[scopeIndex + 1] : null;

    let approved = false;
    let rationale = "";
    let scope: string[] = [];

    if (isYes || overrideScope) {
      approved = isYes;
      rationale = "Auto-resolved";
      scope = overrideScope ? overrideScope.split(",").map(s => s.trim()) : [];
    } else {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await rl.question("\n[y/N]: ");
      approved = answer.trim().toLowerCase() === "y";

      if (approved) {
        rationale = await rl.question("Optional rationale (why is this exception OK?): ");
      } else {
        rationale = await rl.question("Optional rationale (what should the agent do instead?): ");
      }

      const scopeStr = await rl.question("Scope (comma separated, e.g. src/commands, or leave empty for global): ");
      scope = scopeStr.split(",").map(s => s.trim()).filter(s => s);

      rl.close();
    }

    // Fallback to task plan if empty
    if (scope.length === 0) {
      scope = task.plan?.affectedComponents || [];
    }

    // Update state.json
    decision.status = "RESOLVED";
    decision.answer = approved ? "Yes" : "No";
    decision.rationale = rationale;
    decision.timestamp = new Date().toISOString();
    decision.scopedTo = scope;
    decision.resolution = approved ? "Approved." : "Denied.";

    await stateManager.writeState(task);

    // Write to persistent decisions memory
    const decisionDir = path.join(cwd, ".checkpoint", "decisions");
    await fs.mkdir(decisionDir, { recursive: true });
    await fs.writeFile(
      path.join(decisionDir, `${decision.id}.json`),
      JSON.stringify(decision, null, 2),
      "utf-8"
    );

    // Extract memory immediately
    const memoryEngine = new MemoryEngine();
    await memoryEngine.extractMemory([decision], cwd);

    console.log(`\nDecision recorded and memorized for scope: ${scope.join(", ")}`);
  }
}
