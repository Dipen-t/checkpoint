#!/usr/bin/env node

import { adoptCommand } from "./commands/adopt.js";
import { checkCommand } from "./commands/check.js";
import { decisionsCommand } from "./commands/decisions.js";
import { doctorCommand } from "./commands/doctor.js";
import { explainCommand } from "./commands/explain.js";
import { hookCommand } from "./commands/hook.js";
import { initCommand } from "./commands/init.js";
import { inspectCommand } from "./commands/inspect.js";
import { ledgerCommand } from "./commands/ledger.js";
import { loginCommand } from "./commands/login.js";
import { rootCommand } from "./commands/root.js";
import { statusCommand } from "./commands/status.js";
import { verifyCommand } from "./commands/verify.js";
import { versionCommand } from "./commands/version.js";
import { SQLiteRepository } from "./repositories/sqlite-repository.js";

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
    case "login":
      await loginCommand(args[1]);
      break;
    case "ledger":
      await ledgerCommand();
      break;
    case "adopt":
      await adoptCommand(args[1], args[2]);
      break;
    case "check":
      await checkCommand(args[1]);
      break;
    case undefined:
      await rootCommand();
      break;
    default:
      console.log(
        "Usage: checkpoint <init|hook|status|inspect|doctor|verify|decisions|explain|login|ledger|adopt|check>",
      );
      console.log("adopt [path] [local|team|house]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Checkpoint error:", err);
  process.exit(1);
});
