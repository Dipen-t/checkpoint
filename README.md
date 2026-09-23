# Checkpoint 🛑

> **Mandatory thinking, minimum bureaucracy.** 
> The local-first, zero-dependency engineering control layer for AI Coding Agents.

[![npm version](https://img.shields.io/npm/v/@nah/checkpoint.svg)](https://www.npmjs.com/package/@nah/checkpoint)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## The Problem: "Move Fast and Break Things" on Steroids
Autonomous AI coding agents (Cursor, Claude Code, Copilot Workspaces, Devin, etc.) are incredible at writing code quickly, but they lack long-term architectural discipline. If left unmonitored in a large enterprise codebase, they will inevitably take shortcuts—bypassing your Repository layer, introducing scope creep, or hallucinating new dependencies.

Developers are forced to constantly babysit these agents, which completely defeats the purpose of autonomy. 

## The Solution: Proof of Heart
Checkpoint is an intelligent interceptor middleware that sits *between* your AI coding agents and your codebase. It acts as an automated Principal Engineer, strictly enforcing your project's architecture, scope, and engineering decisions.

When the AI agent proposes a change that violates an architectural convention, Checkpoint halts the agent and forces a human developer to approve or deny the decision. It then saves that human ruling in its local memory to dynamically guide future tasks.

---

## ⚡ 30-Second Quickstart

### 1. Install & Initialize
Install Checkpoint globally:

```bash
npm install -g @nah/checkpoint
```

Then, open your AI coding agent (Cursor, Antigravity, etc.) and simply paste this into the chat:

> "Please initialize `@nah/checkpoint` in this workspace."

Your agent will run the command under the hood, automatically scaffolding the `.checkpoint/` local brain and registering the hooks needed to integrate with your AI agent.

### 2. Open Cursor, Claude Code, or Copilot
Start your AI coding session normally. Checkpoint operates silently in the background for routine tasks (0 interruptions).

### 3. Handle Architectural Conflicts
When the agent proposes an architectural violation, Checkpoint will physically block the tool call and output a `DECISION REQUIRED` error directly to the agent.

You can resolve these blocks by typing slash commands in the agent's chat interface:
```text
/checkpoint status     # View pending decisions
/checkpoint verify     # Run the AI's git diff against your architectural rules
```
*(Or use the CLI: `npx @nah/checkpoint decisions resolve <id> --yes`)*

---

## 🧠 Core Architecture

Checkpoint relies on four dedicated engines running purely locally on your machine.

### 1. Decision Engine (Proactive Guardrails)
Before the agent executes filesystem modifications, it must submit an `implementation_plan.md`. The Decision Engine parses this plan using robust AST extraction and evaluates it against deterministic constraints. If the agent violates a constraint, it pauses the execution thread using atomic state locks.

### 2. Memory Engine (Local Semantic RAG)
You cannot stuff 1,000 architectural constraints into a system prompt. Instead, we built a highly optimized, local RAG pipeline using a **pure-TypeScript BM25 algorithm**. It ranks and injects local architectural rules dynamically into the agent's context window. **No vector databases. No 90MB ONNX models. Runs completely offline in milliseconds.**

### 3. Verification Engine (Reactive Guardrails)
Agents lie. Checkpoint doesn't trust the agent's self-reported claims. The Verification Engine runs raw `git diff --name-only` at the end of every turn to observe the true state mutations. If the agent secretly modified files it didn't claim to modify, Checkpoint throws an `EVIDENCE_MISMATCH` block.

### 4. Consistency Engine (Semantic Validation)
Checkpoint uses your existing LLM provider to semantically prove that the resulting `git diff` didn't silently violate a core architectural rule (e.g., catching a direct DB call from a UI component).

---

## 🛠️ Adversarial Edge Cases Handled

Checkpoint is built to handle the chaos of autonomous agents:
* **Agent Lying:** If an agent claims to only edit `auth.ts` but secretly edits `package.json`, Checkpoint trusts `git`, not the agent.
* **Scope Drift:** If you ask the agent to "fix a typo", Checkpoint prevents it from aggressively refactoring a distant module.
* **Amnesia:** When you correct an agent's mistake, Checkpoint serializes your ruling into `.checkpoint/memory`. The agent won't make the same mistake twice.

---

## Disclaimer
This is a `v0.1.0` release intended for adversarial testing and dogfooding. We recommend running it locally to evaluate its effectiveness before deploying it into production enterprise workflows.
