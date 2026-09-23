#!/usr/bin/env node

import { initCommand } from "./commands/init.js";
import { hookCommand } from "./commands/hook.js";
import { statusCommand } from "./commands/status.js";
import { verifyCommand } from "./commands/verify.js";
import { inspectCommand } from "./commands/inspect.js";
import { doctorCommand } from "./commands/doctor.js";
import { versionCommand } from "./commands/version.js";
import { SQLiteRepository } from "./repositories/sqlite-repository.js";

import { decisionsCommand } from "./commands/decisions.js";
import { explainCommand } from "./commands/explain.js";
import { rootCommand } from "./commands/root.js";

async function main() {
  const args = process.argv.slice(2);
  const repo = new SQLiteRepository();
  repo.cacheOutput(args[0] || "none", "Running command");
  const command = args[0];

  switch (command) {
    case "init":
      await initCommand();
      break;
    case "hook":
      await hookCommand(args[1]);
      break;
    case "status":
      await statusCommand();
      break;
    case "inspect":
      await inspectCommand(args[1]);
      break;
    case "doctor":
      await doctorCommand();
      break;
    case "verify":
      await verifyCommand();
      break;
    case "version":
      await versionCommand();
      break;
    case "decisions":
      await decisionsCommand(args[1], args[2]);
      break;
    case "explain":
      await explainCommand();
      break;
    case undefined:
      await rootCommand();
      break;
    default:
      console.log("Usage: checkpoint <init|hook|status|inspect|doctor|verify|decisions|explain>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Checkpoint error:", err);
  process.exit(1);
});
