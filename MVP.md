# Checkpoint - First Version (MVP) Requirements

Based on the Product Requirements Document, this document outlines the exact scope, features, and success criteria for the first usable private MVP of Checkpoint. 

## 1. Core Philosophy for MVP
* **Mandatory thinking, minimum bureaucracy:** Only interrupt the developer for meaningful decisions.
* **Agent-Agnostic Core:** The internal engine must not contain provider-specific logic, though the MVP will only integrate with one real agent initially.
* **Local-First & Git-Native:** All project memory and state must reside locally within the repository (e.g., `.checkpoint/`) and be compatible with Git.

## 2. First Prototype Deliverable (The Heart)
Before building the full CLI, the first major milestone is the **Checkpoint Core Prototype**. 

**Input:**
`Repository + Task + Agent Actions`

**Output:**
`Understanding + Context + Plan + Decisions + Scope + Deviations + Verification + Memory`

If this works reliably, the core engine is successful.

## 3. MVP Feature Scope

### Core Engines
* **Workflow State Machine:** Manage the lifecycle (`IDLE -> DISCOVERY -> UNDERSTANDING -> INVESTIGATION -> PLAN -> DECISION -> IMPLEMENTING -> VERIFICATION -> REVIEW -> MEMORY -> COMPLETED`).
* **Task Lifecycle:** Manage intent, context, plan, decisions, scope, and status.
* **Decision Engine:** Consequentiality detection, ambiguity detection, question generation, and human decision recording.
* **Scope Engine:** Establish approved boundaries and track allowed vs. explicitly out-of-scope areas.
* **Memory Engine:** Read/write and manage conflicts for project state.
* **Project Scanner:** Infer language, framework, architecture, and conventions.
* **Proof Engine:** Compare the approved plan against actual changes (Git diff, changed files, test results).

### Project Memory Structure (`.checkpoint/`)
* **Constitution:** Stable project-wide rules.
* **Architecture:** Structural layout of the project.
* **Conventions:** Repeated implementation patterns.
* **Decisions:** Explicit human choices.
* **Current State:** Task and project progress.

### Intelligence Capabilities
* **Decision Detection:** Knowing when to interrupt the human.
* **Basic Consistency Detection:** Catching architectural deviations.
* **Scope Deviation:** Detecting when the AI touches files/features outside the approved plan.
* **Change-of-Plan Detection:** Recognizing when new requirements alter the implementation path.

### Interface
* **CLI:** Basic commands (`init`, `status`, `task`, `continue`, `review`, `memory`, `decisions`).
* **Local Project State:** Inspectable markdown files and configuration.

### Integration & Tracking
* **Agent Integration:** Support for exactly **one real AI coding agent** (to be chosen).
* **Git:** Git-aware change tracking to monitor what the agent is actually doing.

## 4. Explicitly Deferred (Not in MVP)
* Multiple agent integrations (Codex, Claude, Cursor simultaneously)
* VS Code Extension
* GitHub / CI integrations and enforcements
* Team policies and enterprise administration
* Cloud synchronization and hosted memory
* Analytics and Marketplace
* Advanced code graph

## 5. Success Criteria for the MVP
Before the prototype is considered successful, it must reliably:
1. **Understand tasks:** Identify intent and boundaries.
2. **Identify project patterns:** Find relevant architecture and conventions.
3. **Identify meaningful decisions:** Avoid unnecessary questions.
4. **Detect deviations:** Catch meaningful scope/architecture changes.
5. **Preserve decisions:** Turn important human choices into durable memory.
6. **Reduce future interruptions:** Use established knowledge to eliminate repetitive questions.

## 6. Recommended Build Order
1. Domain model
2. State machine
3. Decision model
4. Memory schema
5. Event model
6. Repository analysis pipeline
7. Decision Engine algorithm
8. Scope/Consistency Engine
9. Agent protocol
10. Prototype
11. Dogfood (Use Checkpoint to build Checkpoint)
