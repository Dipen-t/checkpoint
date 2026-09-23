import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { randomUUID } from "node:crypto";

export async function initCommand() {
  const cwd = process.cwd();
  
  // 1. Scaffold .checkpoint/
  const checkpointDir = path.join(cwd, ".checkpoint");
  await fs.mkdir(checkpointDir, { recursive: true });
  await fs.mkdir(path.join(checkpointDir, "memory"), { recursive: true });
  await fs.mkdir(path.join(checkpointDir, "decisions"), { recursive: true });
  
  const stateFile = path.join(checkpointDir, "state.json");
  try {
    await fs.access(stateFile);
    console.log(".checkpoint/state.json already exists.");
  } catch {
    await fs.writeFile(stateFile, JSON.stringify({
      taskId: null,
      planId: null,
      status: "IDLE"
    }, null, 2));
    console.log("Created .checkpoint/state.json");
  }

  // 2. Wire up Antigravity hooks idempotently
  const agentsDir = path.join(cwd, ".agents");
  await fs.mkdir(agentsDir, { recursive: true });

  const hooksFile = path.join(agentsDir, "hooks.json");
  let hooksConfig: any = {};
  
  try {
    const raw = await fs.readFile(hooksFile, "utf-8");
    hooksConfig = JSON.parse(raw);
  } catch {
    // Doesn't exist or isn't valid JSON, start fresh
  }

  // The hook command execution string. It should work cross-platform (npx delegates to .cmd on Windows)
  const execCmd = "npx checkpoint hook";

  if (!hooksConfig["checkpoint-integration"]) {
    hooksConfig["checkpoint-integration"] = {};
  }

  const integration = hooksConfig["checkpoint-integration"];
  
  // Only override if not already defined so we don't clobber manual tweaks,
  // but for init, we ensure the minimal hooks are present.
  
  // PreInvocation
  if (!integration.PreInvocation) integration.PreInvocation = [];
  if (!integration.PreInvocation.some((h: any) => h.command && h.command.includes("hook pre-invocation"))) {
    integration.PreInvocation.push({ type: "command", command: `${execCmd} pre-invocation` });
  }

  // PreToolUse
  if (!integration.PreToolUse) integration.PreToolUse = [];
  const hasPreToolUse = integration.PreToolUse.some((group: any) => 
    group.matcher && group.matcher.includes("replace_file_content")
  );
  if (!hasPreToolUse) {
    integration.PreToolUse.push({
      matcher: "replace_file_content|multi_replace_file_content|write_to_file",
      hooks: [{ type: "command", command: `${execCmd} pre-tool-use` }]
    });
  }

  // Stop
  if (!integration.Stop) integration.Stop = [];
  if (!integration.Stop.some((h: any) => h.command && h.command.includes("hook stop"))) {
    integration.Stop.push({ type: "command", command: `${execCmd} stop` });
  }

  await fs.writeFile(hooksFile, JSON.stringify(hooksConfig, null, 2));
  console.log("Updated .agents/hooks.json for Antigravity integration.");

  // 3. Install Antigravity Skill
  const skillsDir = path.join(agentsDir, "skills", "checkpoint");
  await fs.mkdir(skillsDir, { recursive: true });
  
  const skillContent = `---
name: checkpoint
description: >-
  Activate this skill when the user types \`@checkpoint\`, \`/checkpoint\`, or explicitly asks to evaluate the current task, status, or decisions using Checkpoint. Also activate this skill when a tool execution is denied by Checkpoint and instructs you to ask the user a question.
---

# Checkpoint Interface

This skill connects you (the agent) directly to the local Checkpoint architecture. Checkpoint is a system that evaluates your plans and architectural decisions.

## How to Handle Explicit User Commands

When the user types one of the following commands, execute the corresponding CLI command and present the output verbatim to the user:

*   If they type \`@checkpoint\` or \`/checkpoint\`:
    Run \`${execCmd}\`
*   If they type \`@checkpoint status\` or \`/checkpoint status\`:
    Run \`${execCmd} status\`
*   If they type \`@checkpoint verify\` or \`/checkpoint verify\`:
    Run \`${execCmd} verify\`
*   If they type \`@checkpoint decisions\` or \`/checkpoint decisions\`:
    Run \`${execCmd} decisions\`
*   If they type \`@checkpoint explain\` or \`/checkpoint explain\`:
    Run \`${execCmd} explain\`

*Present the output of these commands directly to the user cleanly.*

## How to Handle Automatic Decisions (Hook Denials)

If you attempt to execute a tool, and Checkpoint **denies** the tool execution with a reason starting with "CHECKPOINT DECISION REQUIRED", you must do the following:

1.  **Do not try the tool again immediately.** Checkpoint has paused your workflow because it needs human architectural approval.
2.  **Ask the user.** The \`reason\` field in the tool denial will contain a detailed prompt formatted by Checkpoint. Present this exact question and its options to the user naturally in the chat.
3.  **Wait for the user's response.** Stop and wait for the user to answer the question, optionally providing their rationale.
4.  **Resolve the decision.** Once the user replies, if they approved the exception, run the following command to record their choice (replace \`<decision-id>\` and \`<user-defined-scope>\` appropriately):
    \`${execCmd} decisions resolve <decision-id> --yes --scope "<user-defined-scope>"\`
    *(If the user said No, you must ask them what to do instead or adjust your plan).*
5.  **Resume.** Once the decision is resolved, you may re-attempt the exact same tool execution. Checkpoint will now silently allow it because the decision was explicitly approved and memorized.
`;

  await fs.writeFile(path.join(skillsDir, "SKILL.md"), skillContent);
  console.log("Updated .agents/skills/checkpoint/SKILL.md.");
  
  // 4. Interactive Prompts or Bootstrap Mode
  const memoryDir = path.join(checkpointDir, "memory");
  
  const createMemory = async (type: string, content: string, confidence: string = "CONFIRMED") => {
    if (!content.trim()) return;
    const id = randomUUID();
    const memory = {
      id,
      type,
      content,
      confidence,
      provenance: "checkpoint init",
      scopedTo: ["global"]
    };
    await fs.writeFile(path.join(memoryDir, `${id}.json`), JSON.stringify(memory, null, 2));
  };

  // Check for existing project
  let isExistingProject = false;
  try {
    await fs.access(path.join(cwd, "package.json"));
    isExistingProject = true;
  } catch {
    try {
      await fs.access(path.join(cwd, "src"));
      isExistingProject = true;
    } catch {}
  }

  if (isExistingProject) {
    console.log("\n--- Checkpoint Bootstrap Mode ---");
    console.log("Existing project detected. Analyzing repository baseline...");
    
    // Dynamic import to avoid circular dep if any, though UnderstandingEngine is standalone
    const { UnderstandingEngine } = await import("../engines/understanding/index.js");
    const engine = new UnderstandingEngine();
    const context = await engine.scanWorkspace(cwd);
    
    console.log(`\nProject Baseline Discovered:`);
    let inferredCount = 0;

    if (context.runtime) {
      console.log(`✓ Runtime: ${context.runtime}`);
      await createMemory("ARCHITECTURE", `Runtime Environment: ${context.runtime}`, "INFERRED");
      inferredCount++;
    }
    if (context.language) {
      console.log(`✓ Language: ${context.language}`);
      await createMemory("ARCHITECTURE", `Primary Language: ${context.language}`, "INFERRED");
      inferredCount++;
    }
    if (context.frameworks.length > 0) {
      console.log(`✓ Frameworks: ${context.frameworks.join(", ")}`);
      await createMemory("ARCHITECTURE", `Frameworks: ${context.frameworks.join(", ")}`, "INFERRED");
      inferredCount++;
    }
    if (context.architecturalPatterns.length > 0) {
      console.log(`✓ Architecture: ${context.architecturalPatterns.join(", ")}`);
      await createMemory("ARCHITECTURE", `Architectural Patterns: ${context.architecturalPatterns.join(", ")}`, "INFERRED");
      inferredCount++;
    }
    if (context.codeConsistency.length > 0) {
      console.log(`✓ Consistency: ${context.codeConsistency.join(", ")}`);
      await createMemory("CONVENTION", `Code Consistency: ${context.codeConsistency.join(", ")}`, "INFERRED");
      inferredCount++;
    }

    console.log(`\n${inferredCount} potentially important conventions identified and saved as INFERRED.`);
    console.log("Checkpoint will NOT enforce these conventions until you explicitly confirm them during a tool block.");
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n--- Checkpoint Initial Configuration ---");
    console.log("Let's set up some foundational rules for this project.\n");
    
    const domainStr = await rl.question("1. What is the purpose of this project, and what features have been built or need to be built? (e.g., An e-commerce site; currently have authentication, need to build cart): ");
    const architectureStr = await rl.question("2. What is the primary architecture or tech stack for this project? (e.g., Express + React, Next.js, Django): ");
    
    const archContext = architectureStr.trim() ? `Given you're using ${architectureStr.trim()}` : "What";
    const structureStr = await rl.question(`3. ${archContext}, what is the intended project structure? (e.g., standard MVC, monorepo, microservices): `);
    
    const structContext = structureStr.trim() ? `using a ${structureStr.trim()} structure` : "";
    const baseContext = architectureStr.trim() ? `For this ${architectureStr.trim()} project` : "For this project";
    const finalContext = `${baseContext} ${structContext}`.trim();
    const productionStr = await rl.question(`4. ${finalContext}, are there any specific production rules or constraints? (e.g., always use Postgres, require Docker): `);
    
    rl.close();

    if (domainStr.trim()) {
      await createMemory("CONVENTION", `Project Domain and Status: ${domainStr}`);
    }
    await createMemory("ARCHITECTURE", `Project Stack: ${architectureStr}`);
    await createMemory("CONVENTION", `Project Structure: ${structureStr}`);
    if (productionStr.trim()) {
      await createMemory("ARCHITECTURE", `Production Constraints: ${productionStr}`);
    }
  }

  console.log("\nCheckpoint initialized successfully.");
  console.log("✓ Core configuration");
  console.log("✓ Project memory");
  console.log("✓ Antigravity hooks");
  console.log("✓ Antigravity skill\n");
  console.log("Available commands in chat:");
  console.log("/checkpoint");
  console.log("/checkpoint status");
  console.log("/checkpoint verify");
  console.log("/checkpoint decisions");
  console.log("/checkpoint explain");
}
