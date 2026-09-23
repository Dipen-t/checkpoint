import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";

async function runCliWithInput(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/cli.js", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    if (input) {
      child.stdin.write(input);
      setTimeout(() => child.stdin.end(), 500);
    }
  });
}

async function runCliInteractive(args, inputs) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/cli.js", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    
    child.stdout.on("data", (data) => {
      stdout += data;
      const str = data.toString();
      if (str.includes("[y/N]:")) {
        child.stdin.write(inputs.shift() + "\n");
      } else if (str.includes("Optional rationale")) {
        child.stdin.write(inputs.shift() + "\n");
      } else if (str.includes("Scope (comma separated")) {
        child.stdin.write(inputs.shift() + "\n");
      }
    });

    child.on("close", (code) => {
      resolve({ code, stdout });
    });
  });
}

async function main() {
  console.log("=== TASK 1: Routine (No Decision) ===");
  const payload1 = {
    toolCall: {
      name: "write_to_file",
      args: {
        TargetFile: "implementation_plan.md",
        CodeContent: "- Add lodash to package.json via npm install"
      }
    }
  };
  const res1 = await runCliWithInput(["hook", "pre-tool-use"], JSON.stringify(payload1));
  console.log("Response 1:", res1.stdout);

  console.log("=== TASK 2: Meaningful Decision ===");
  const payload2 = {
    toolCall: {
      name: "write_to_file",
      args: {
        TargetFile: "implementation_plan.md",
        CodeContent: "- Put persistence logic directly inside the CLI commands"
      }
    }
  };
  const res2 = await runCliWithInput(["hook", "pre-tool-use"], JSON.stringify(payload2));
  console.log("Response 2:", res2.stdout);
  
  const parsed2 = JSON.parse(res2.stdout.split("\n").filter(l => l.startsWith("{")).pop() || "{}");
  if (parsed2.decision !== "deny") {
    console.error("Task 2 did not deny!");
  } else {
    console.log("Hook correctly denied with reason:", parsed2.reason);
  }

  // Read state to find the pending decision
  const stateStr = await fs.readFile(path.join(".checkpoint", "state.json"), "utf-8");
  const state = JSON.parse(stateStr);
  const pending = state.decisions.find(d => d.status === "PENDING");
  
  if (!pending) {
    console.error("No pending decision found for Task 2!");
    return;
  }
  console.log(`Found pending decision: ${pending.id}`);

  console.log("=== RESOLVING DECISION ===");
  const resResolve = await runCliWithInput(
    ["decisions", "resolve", pending.id, "--yes", "--scope", "CLI commands"],
    ""
  );
  console.log("Resolve output:\n", resResolve.stdout);

  console.log("=== TASK 3: Repeated Decision (Should be silent) ===");
  const payload3 = {
    toolCall: {
      name: "write_to_file",
      args: {
        TargetFile: "implementation_plan.md",
        CodeContent: "- Put persistence logic directly inside the CLI commands"
      }
    }
  };
  const res3 = await runCliWithInput(["hook", "pre-tool-use"], JSON.stringify(payload3));
  console.log("Response 3:", res3.stdout);
  
  const finalStateStr = await fs.readFile(path.join(".checkpoint", "state.json"), "utf-8");
  const finalState = JSON.parse(finalStateStr);
  const newPending = finalState.decisions.filter(d => d.status === "PENDING");
  console.log(`New pending decisions after Task 3: ${newPending.length}`);

}

main().catch(console.error);
