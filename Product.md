Yes. Below is the **full PRD I would use as the source of truth for building the private first version**. I’m intentionally treating this as a product we will dogfood before open-sourcing—not as an npm package specification yet.

# Product Requirements Document — Checkpoint

**Version:** 0.1
**Status:** Pre-development
**Product type:** Local-first developer tooling / engineering workflow layer
**Primary interface:** CLI
**Distribution:** npm
**Initial deployment:** Local/private
**Target:** AI-assisted software development
**Working name:** Checkpoint

---

# 1. Executive Summary

AI coding agents have changed software development by allowing developers to delegate increasingly large portions of implementation.

The problem is no longer simply:

> "Can AI write the code?"

The bigger problem is:

> **"Does the developer still understand and control the engineering decisions being made while AI writes the code?"**

AI can move extremely quickly. It can inspect a repository, modify dozens of files, introduce dependencies, change architecture, alter data models, and complete a feature before the developer has meaningfully considered what happened.

Existing approaches generally focus on:

* generating code,
* planning,
* code review,
* permissions,
* agent orchestration,
* or memory/context.

Checkpoint takes a different approach.

It introduces a **persistent engineering workflow between the developer and AI coding agent**.

Checkpoint:

1. Understands the developer's intent.
2. Understands the project's existing architecture and conventions.
3. Determines which decisions actually require human judgment.
4. Interrupts the developer only when meaningful decisions arise.
5. Allows AI to execute routine implementation autonomously.
6. Detects deviations from the approved approach.
7. Challenges decisions that conflict with repository evidence.
8. Records important human decisions as reusable project memory.
9. Produces evidence-based implementation reports.
10. Becomes progressively quieter as it learns the project.

### Core philosophy

> **AI handles implementation. Humans own engineering decisions. The project remembers those decisions.**

---

# 2. Product Vision

Checkpoint should become an **engineering layer for AI-assisted development**.

It should sit alongside existing AI coding agents rather than trying to replace them.

```text
Developer
    │
    ▼
AI Coding Agent
    │
    ▼
┌─────────────────────────────┐
│         CHECKPOINT          │
│                             │
│ Understand                  │
│ Investigate                 │
│ Decide                      │
│ Track                       │
│ Detect                      │
│ Verify                      │
│ Remember                    │
└─────────────────────────────┘
    │
    ▼
Git Repository
```

The long-term vision is:

> **Every project develops an engineering memory and every AI agent working on it understands the project's way of building software.**

---

# 3. Problem Statement

## 3.1 Primary problem

AI coding agents can make substantial engineering changes faster than humans can effectively review them.

This creates several problems:

### Problem A — Reduced developer awareness

Developers may accept AI-generated implementations without understanding:

* why a particular architecture was chosen,
* which files changed,
* what assumptions were made,
* what wasn't changed,
* what risks were introduced.

### Problem B — Architectural inconsistency

AI may implement a new feature differently from the existing project architecture.

Example:

```text
Existing

Controller
   ↓
Service
   ↓
Repository
   ↓
Database
```

AI introduces:

```text
Controller
   ↓
Database
```

The code may work.

But the project becomes less consistent.

### Problem C — Scope expansion

A task starts as:

> "Add notifications."

AI eventually modifies:

* authentication,
* database architecture,
* permissions,
* unrelated UI.

The developer may not realize the scope has expanded.

### Problem D — Lost decisions

Developers repeatedly answer the same questions:

> "Should we use Redis?"

> "Should this be a repository?"

> "How should errors be handled?"

> "Should this be server-side?"

The AI may not reliably retain these decisions.

### Problem E — Agent switching

A developer may use:

* Codex today,
* Claude tomorrow,
* Cursor later.

Project knowledge shouldn't belong to a particular AI vendor.

### Problem F — Review overload

If humans are forced to inspect every AI-generated line manually, AI loses much of its productivity advantage.

We therefore need **selective human attention**, not universal manual review.

---

# 4. Product Hypothesis

We believe AI-assisted development becomes significantly safer and more effective when:

> **Human attention is focused on consequential engineering decisions instead of every implementation detail.**

We further believe that:

> **Project memory generated from confirmed engineering decisions allows the system to ask fewer questions over time while becoming more consistent with the project.**

---

# 5. Goals

## Primary goals

### G1 — Preserve meaningful human engineering involvement

The developer should remain involved in consequential decisions.

### G2 — Minimize unnecessary interruptions

Checkpoint should not become an approval bureaucracy.

### G3 — Understand existing project conventions

AI should work with the project's existing architecture rather than repeatedly reinventing it.

### G4 — Detect meaningful deviations

Checkpoint should detect when actual implementation diverges from the approved approach.

### G5 — Build persistent project memory

Important decisions should survive:

* sessions,
* agents,
* developers,
* time.

### G6 — Make AI work auditable

A developer should be able to understand:

* what was requested,
* what was planned,
* what was decided,
* what changed,
* what was verified.

### G7 — Remain agent-agnostic

The core product must not depend on one AI provider.

### G8 — Be local-first

The initial system should work without requiring a cloud account or hosted backend.

---

# 6. Non-Goals

The initial product will **not** attempt to:

* replace Codex/Claude/Cursor/etc.
* build another general-purpose coding agent,
* provide a chat interface,
* host LLMs,
* become a cloud SaaS platform,
* provide enterprise compliance dashboards,
* provide a vector database,
* automatically review every line,
* enforce approval for every file change,
* replace GitHub,
* replace CI/CD,
* create a project-management system.

---

# 7. Target Users

## Primary

### AI-heavy individual developer

Uses AI coding agents daily and wants more control without slowing down.

---

## Secondary

### Startup engineering teams

Small teams where developers rely heavily on AI and need consistency across contributors.

---

### Junior developers

Developers who want AI assistance while still understanding engineering decisions.

---

### Senior developers

Developers who want AI to move faster without constantly checking whether it violated project architecture.

---

# 8. Core Product Principle

## Mandatory thinking, minimum bureaucracy.

This should be the single most important product principle.

Checkpoint should **never ask a question simply because a question can be asked.**

Every interruption must have a reason.

Bad:

> "Do you approve this implementation?"

Good:

> "The existing architecture uses repositories, but this implementation bypasses them. Is this exception intentional?"

---

# 9. Core User Experience

The product lifecycle is:

```text
INTENT
  ↓
UNDERSTAND
  ↓
INVESTIGATE
  ↓
PROPOSE
  ↓
DECISION
  ↓
IMPLEMENT
  ↓
MONITOR
  ↓
VERIFY
  ↓
REVIEW
  ↓
REMEMBER
  ↓
COMPLETE
```

Not every stage requires user interaction.

---

# 10. User Journey

## Step 1 — Initialize

Developer enters:

```bash
npx checkpoint init
```

Checkpoint scans the repository.

It identifies:

* language,
* framework,
* package manager,
* source structure,
* tests,
* database,
* Git,
* configuration,
* AI-related files.

Example:

```text
✓ Git detected
✓ TypeScript detected
✓ Next.js detected
✓ Prisma detected
✓ PostgreSQL configuration detected

Project scan complete.

247 source files
31 test files
14 services
8 repositories

Checkpoint is ready.
```

---

# 11. Project Understanding

Checkpoint generates an initial project model.

It should identify:

### Technology

```text
Next.js
TypeScript
PostgreSQL
Prisma
```

### Architecture

```text
App
 ├── UI
 ├── API
 ├── Services
 ├── Repositories
 └── Database
```

### Patterns

Examples:

* validation library,
* error handling,
* authentication,
* API conventions,
* state management,
* database access,
* testing conventions.

---

# 12. Memory Structure

Checkpoint creates a hidden/local project directory:

```text
.checkpoint/
├── config.yaml
├── constitution.md
├── architecture.md
├── conventions.md
│
├── decisions/
│   ├── DEC-001.md
│   ├── DEC-002.md
│   └── ...
│
├── state/
│   └── current.md
│
├── lessons/
│   └── ...
│
└── sessions/
    └── ...
```

The exact file structure can change during implementation.

The important requirement is that the memory is:

* human-readable,
* Git-compatible,
* inspectable,
* portable,
* structured.

---

# 13. Memory Types

## 13.1 Constitution

Stable project-wide rules.

Example:

```text
Business logic belongs in services.

Database access must go through repositories.

API inputs must be validated using Zod.
```

---

## 13.2 Architecture

How the project is structured.

---

## 13.3 Conventions

Repeated implementation patterns.

---

## 13.4 Decisions

Explicit human choices.

Example:

```text
Decision: DEC-021

Question:
How should subscription cancellation behave?

Decision:
Cancellation takes effect at the end of the billing period.

Reason:
Users retain access to paid functionality until
their existing subscription expires.

Status:
Active
```

---

## 13.5 Lessons

Important discoveries.

Example:

```text
Stripe webhook events may arrive out of order.
```

---

## 13.6 Current state

Current task/project state.

---

# 14. Memory Rules

Checkpoint must **not** turn every conversation into memory.

Memory should generally originate from:

* explicit human decisions,
* repeatedly observed conventions,
* confirmed architecture,
* important implementation lessons,
* durable project state.

---

# 15. Memory Confidence

Every piece of inferred knowledge should have a confidence/state classification.

```text
OBSERVED
   ↓
INFERRED
   ↓
REPEATED
   ↓
CONFIRMED
```

AI must distinguish:

> "I observed this."

from:

> "The developer explicitly decided this."

---

# 16. Memory Conflict Detection

When repository evidence conflicts with memory:

```text
⚠ MEMORY CONFLICT

Project memory:
API validation uses Zod.

Repository evidence:
5 recently modified routes use Yup.

Possible explanations:

1. Memory is outdated.
2. These routes are exceptions.
3. Existing code violates the convention.

Human clarification recommended.
```

The system must not silently overwrite important decisions.

---

# 17. Task Understanding

When the developer starts a task, Checkpoint should establish:

### Intent

What is the user actually asking for?

### Scope

What is included?

### Boundaries

What is explicitly not included?

### Expected behavior

What should the resulting feature do?

---

# 18. Investigation

Before proposing implementation, the system should inspect relevant repository context.

It should look for:

* similar implementations,
* existing services,
* components,
* API patterns,
* tests,
* database models,
* dependencies,
* project memory,
* Git history when useful.

The goal is not to index the entire repository blindly.

It is:

> **Find the smallest amount of context required to make a good engineering decision.**

---

# 19. Project Consistency Engine

The Consistency Engine compares a proposed implementation with established project patterns.

Example:

```text
Existing:

Controller
 ↓
Service
 ↓
Repository
 ↓
Prisma
```

AI proposal:

```text
Controller
 ↓
Prisma
```

Checkpoint:

```text
⚠ ARCHITECTURAL DEVIATION

The proposed implementation bypasses the
repository layer.

Existing pattern found in:
• UserService
• OrderService
• PaymentService

Reason for exception?
```

---

# 20. Decision Engine

This is the heart of the system.

Its responsibility:

> **Determine whether a human decision is necessary.**

Decision evaluation should consider:

1. Does existing memory answer this?
2. Does an established convention answer this?
3. Does repository evidence strongly suggest an answer?
4. Is the decision consequential?
5. Is there meaningful ambiguity?
6. Does it introduce risk?
7. Does it change architecture?
8. Does it expand scope?

---

# 21. Decision Categories

### Human intervention generally required

* architecture changes,
* security decisions,
* data model decisions,
* breaking API changes,
* authentication/authorization behavior,
* destructive operations,
* major dependency changes,
* significant performance tradeoffs,
* product behavior ambiguity,
* scope expansion,
* deviation from established architecture.

### Usually no intervention

* formatting,
* naming,
* routine CRUD implementation,
* obvious bug fixes,
* test creation,
* straightforward refactoring consistent with project patterns,
* following an already-confirmed convention.

---

# 22. Question Generation

Questions must be:

* short,
* contextual,
* actionable,
* backed by evidence,
* limited in number.

Bad:

> "What architecture would you like?"

Good:

> "Existing billing features use service → repository → Prisma. The new feature could follow that pattern or introduce a direct database access layer. Which should we use?"

---

# 23. The One-Time Decision Principle

When a decision is answered and becomes a confirmed project convention, Checkpoint should not repeatedly ask the same question.

Example:

First task:

> "Should API validation use Zod?"

Developer:

> "Yes."

Later tasks:

```text
Checkpoint:

I'll use Zod because this is an established
project convention.
```

No interruption.

---

# 24. Learning System

The system should learn from:

* approvals,
* rejections,
* repeated decisions,
* corrections,
* project patterns.

But it should not immediately convert one answer into a permanent rule.

Example:

```text
Decision 1:
Developer chooses native Date APIs.

Decision 2:
Developer chooses native Date APIs.

Decision 3:
Developer chooses native Date APIs.

Candidate preference:
Prefer native platform APIs before new dependencies.
```

Eventually:

```text
Confirmed convention.
```

---

# 25. AI Challenge

Checkpoint should be able to disagree respectfully.

Example:

```text
⚠ CHALLENGE

You selected Redux.

Repository evidence:
• Zustand is already used in 23 components.
• Existing store architecture is based on Zustand.
• Redux is not currently installed.

This introduces a second state-management system.

If intentional, explain why.
```

The developer retains final authority.

---

# 26. Scope Contract

Once the approach is approved, Checkpoint creates a scope contract.

Example:

```text
APPROVED SCOPE

Allowed:
✓ NotificationService
✓ NotificationRepository
✓ Notification UI
✓ Notification API

Explicitly outside scope:
✗ Authentication
✗ Billing
✗ User permissions
```

The implementation is continuously compared against this contract.

---

# 27. Change-of-Plan Detection

If implementation diverges:

```text
⚠ PLAN CHANGE

Original plan:
3 application areas

New requirement discovered:
Database schema must change.

New files:
+ prisma/schema.prisma
+ migration

Reason:
Notifications require persistent read state.

This expands the approved scope.
```

Human intervention occurs only because something materially changed.

---

# 28. No Silent Completion

AI must not simply say:

> "Done."

Completion must have a structured state.

```text
PLANNED
IMPLEMENTED
VERIFIED
REVIEWED
MEMORIZED
```

Only then:

```text
COMPLETED
```

---

# 29. Proof Engine

The Proof Engine compares:

```text
Approved Plan
       ↓
Actual Changes
       ↓
Verification Results
       ↓
Final State
```

It should use actual evidence where possible:

* changed files,
* Git diff,
* test results,
* TypeScript results,
* build results,
* lint results,
* dependency changes.

---

# 30. Completion Report

Example:

```text
IMPLEMENTATION COMPLETE

Changed:
12 files

Added:
4 files

Removed:
1 file

Tests:
✓ 24 passed

TypeScript:
✓ Passed

Build:
✓ Passed

Original plan:
✓ Completed

Unexpected changes:
⚠ Database migration added

Reason:
Persistent notification state required.

Intentionally unchanged:
• Authentication
• Billing
• Admin permissions

Known limitation:
Production WebSocket behavior not tested.
```

This is the human's final understanding checkpoint.

---

# 31. Adaptive Review

Checkpoint must adapt review depth.

### Low-risk task

```text
Review:
✓ Scope unchanged
✓ No architectural deviation
✓ Tests pass

Continue?
```

### Medium task

```text
Review:
• What changed?
• What architectural decisions were made?
• What remains unverified?
```

### High-risk task

More detailed evidence and explicit review.

---

# 32. The Core State Machine

Initial state model:

```text
IDLE
 ↓
DISCOVERY
 ↓
UNDERSTANDING
 ↓
INVESTIGATION
 ↓
PLAN
 ↓
DECISION_REQUIRED?
 ├── NO ──────────────┐
 │                    │
 └── YES → HUMAN      │
          DECISION    │
             ↓        │
          APPROVED    │
             └────────┘
                  ↓
             IMPLEMENTING
                  ↓
           PLAN_CHANGE?
            ├── YES
            │    ↓
            │ HUMAN DECISION
            │    ↓
            └────┘
                  ↓
             VERIFICATION
                  ↓
                REVIEW
                  ↓
             MEMORY UPDATE
                  ↓
              COMPLETED
```

---

# 33. Task Object

Conceptually:

```text
Task
├── id
├── intent
├── context
├── plan
├── decisions
├── scope
├── changes
├── deviations
├── verification
├── review
├── memoryUpdates
└── status
```

---

# 34. Event System

The system should internally produce events such as:

```text
TASK_CREATED
PROJECT_SCANNED
CONTEXT_FOUND
PLAN_CREATED
DECISION_DETECTED
DECISION_REQUESTED
DECISION_RESOLVED
IMPLEMENTATION_STARTED
FILE_CHANGED
SCOPE_DEVIATION_DETECTED
PLAN_CHANGED
VERIFICATION_STARTED
VERIFICATION_COMPLETED
REVIEW_COMPLETED
MEMORY_CANDIDATE_CREATED
MEMORY_UPDATED
TASK_COMPLETED
```

This gives us an auditable and testable core.

---

# 35. Agent Architecture

Checkpoint must be agent-agnostic.

Conceptually:

```text
                 CHECKPOINT CORE
                       │
                 AGENT PROTOCOL
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      Codex          Claude         Cursor
```

The core shouldn't contain provider-specific business logic.

---

# 36. Initial Integration Strategy

Don't support everything.

### Phase 1

Build the core without depending on a specific agent.

### Phase 2

Integrate with **one real coding agent**.

### Phase 3

Add a second.

### Phase 4

Generalize the protocol based on real integration differences.

This prevents us from designing an imaginary universal protocol.

---

# 37. Installation

Primary onboarding:

```bash
npx checkpoint init
```

Later:

```bash
npm install -g checkpoint
```

But the product should feel like:

> **"Checkpoint has been added to my project."**

Not:

> "I installed another app I have to remember to use."

---

# 38. Local-First Architecture

Initial architecture:

```text
Developer Machine
│
├── Repository
│
├── Checkpoint CLI
│
├── Checkpoint Core
│
├── Project Memory
│
└── AI Agent
```

No mandatory cloud service.

---

# 39. Git-Native Design

Checkpoint state should be compatible with Git.

Benefits:

* history,
* collaboration,
* rollback,
* portability,
* agent independence,
* transparency.

A developer should be able to inspect:

```text
git diff .checkpoint/
```

and understand what changed.

---

# 40. CLI

Initial commands:

```bash
checkpoint init
checkpoint status
checkpoint task
checkpoint continue
checkpoint review
checkpoint memory
checkpoint decisions
checkpoint doctor
```

The CLI should not become the primary cognitive burden.

Most interaction should happen naturally during the coding workflow.

---

# 41. `checkpoint status`

Example:

```text
TASK: Add subscription cancellation

Phase:
Verification

Progress:
██████████████░░ 90%

✓ Plan
✓ Decision
✓ Implementation
✓ Tests
○ Final review

Memory:
18 decisions
7 conventions
3 lessons
```

---

# 42. `checkpoint doctor`

Project health:

```text
PROJECT HEALTH

✓ 18 active decisions
✓ 7 confirmed conventions

⚠ 2 stale memories
⚠ 1 architecture conflict

✓ No incomplete checkpoints
```

This is useful but not MVP-critical.

---

# 43. Configuration

Defaults should work without configuration.

Optional:

```yaml
checkpoint:
  review: adaptive
  memory: true
  scope: true
```

Users should not need to understand internal machinery.

---

# 44. Security Requirements

Because Checkpoint observes code and potentially AI actions:

### R1

No source code leaves the machine unless explicitly configured.

### R2

Secrets must not be written to memory.

### R3

`.env` and secret files should be excluded by default.

### R4

Memory should never store:

* API keys,
* tokens,
* passwords,
* credentials.

### R5

AI-generated memory must be treated as untrusted until validated.

---

# 45. Privacy Principle

Default:

> **Your project knowledge belongs to your repository.**

No account should be required for the core product.

---

# 46. Performance Requirements

Checkpoint should not noticeably slow normal development.

Targets:

### Initialization

Preferably under a few seconds for normal repositories.

### Routine decision evaluation

Should feel nearly instantaneous aside from LLM calls.

### File monitoring

Must not continuously rescan the entire repository.

### Memory retrieval

Should retrieve only relevant context.

---

# 47. Context Efficiency

Checkpoint should avoid dumping:

```text
Entire repository
+
Entire memory
+
Entire conversation
```

into every model request.

Instead:

```text
Task
 ↓
Relevant context
 ↓
Relevant decisions
 ↓
Relevant conventions
 ↓
Relevant files
```

This is important both for speed and cost.

---

# 48. Memory Retrieval

Given:

> "Add Stripe refunds."

Retrieve:

```text
Billing architecture
Stripe decisions
PaymentService
RefundService
Error handling
Relevant tests
```

Don't retrieve unrelated:

```text
MarketingService
LandingPage
AdminDashboard
```

---

# 49. Failure Handling

Checkpoint must handle:

### Agent crashes

Resume from state.

### Terminal closes

Resume.

### Partial implementation

Detect incomplete task.

### Agent changes plan unexpectedly

Pause.

### Memory conflict

Surface conflict.

### Human rejects plan

Allow re-planning.

### Verification failure

Return to implementation.

---

# 50. Resume

A critical feature.

```bash
checkpoint continue
```

Should reconstruct:

```text
Task
Plan
Decisions
Scope
Changes
Memory
Current state
```

The user shouldn't have to explain the entire task again.

---

# 51. Multi-Agent Handoff

Eventually:

```text
Claude
 ↓
Checkpoint state
 ↓
Codex
```

Codex should understand:

```text
What was done
What remains
What was decided
Why
Known issues
Current scope
```

This is one of the strongest reasons to keep project state agent-independent.

---

# 52. Dogfooding Requirement

Checkpoint must eventually be used to build itself.

Example:

```bash
checkpoint task "Build decision engine"
```

Then:

```bash
checkpoint task "Build memory engine"
```

Then:

```bash
checkpoint task "Build consistency engine"
```

Every major subsystem should be built under its own workflow.

---

# 53. Testing Strategy

We need more than unit tests.

## Unit tests

Test:

* decision classification,
* memory promotion,
* conflict detection,
* scope comparison,
* state transitions.

## Integration tests

Test:

```text
Task
→ Plan
→ Decision
→ Implementation
→ Deviation
→ Review
→ Memory
```

## Fixture repositories

Create realistic projects:

```text
fixtures/
├── nextjs/
├── react/
├── node/
├── nestjs/
└── messy-project/
```

---

# 54. Adversarial Test Suite

Intentionally create AI behavior that:

* bypasses architecture,
* modifies unrelated files,
* adds unnecessary dependencies,
* changes database schema,
* contradicts memory,
* expands scope,
* claims tests passed when they didn't,
* ignores an explicit decision.

Checkpoint must detect these.

This test suite becomes extremely important.

---

# 55. Success Criteria for the Private Prototype

Before we call the heart successful:

### It must:

**1. Understand tasks**

Reasonably identify intent and boundaries.

**2. Identify project patterns**

Find relevant architecture and conventions.

**3. Identify meaningful decisions**

Avoid unnecessary questions.

**4. Detect deviations**

Catch meaningful scope/architecture changes.

**5. Preserve decisions**

Turn important human choices into durable memory.

**6. Reduce future interruptions**

Previously established knowledge should eliminate repetitive questions.

---

# 56. Primary Product Metrics

We shouldn't optimize for:

> Number of tasks processed.

Instead:

### Meaningful interruption rate

How often does an interruption result in a useful decision?

### Repeated-question rate

How often does Checkpoint ask something it already knows?

Target: continuously decreasing.

### False interruption rate

How often did users feel the interruption wasn't necessary?

### Missed-decision rate

How often did Checkpoint fail to interrupt for a genuinely consequential decision?

### Scope detection accuracy

How often does it correctly detect unexpected changes?

### Memory usefulness

How often does stored knowledge improve a future task?

---

# 57. North Star Metric

> **Percentage of consequential engineering decisions that are resolved with the appropriate amount of human involvement.**

The system should optimize for **quality of human attention**, not quantity.

---

# 58. UX Success Criteria

A developer should eventually feel:

> "Checkpoint doesn't slow me down."

Instead:

> **"When Checkpoint interrupts me, I know it's probably worth paying attention."**

That's the product's most important UX outcome.

---

# 59. MVP Definition

The first usable private MVP contains:

### Core

* workflow state machine
* task lifecycle
* decision engine
* scope engine
* memory engine
* project scanner
* proof engine

### Memory

* constitution
* architecture
* conventions
* decisions
* current state

### Intelligence

* decision detection
* basic consistency detection
* scope deviation
* change-of-plan detection

### Interface

* CLI
* local project state

### Integration

* one real AI coding agent

### Git

* Git-aware change tracking

---

# 60. Explicitly Deferred

After MVP:

* multiple agent integrations,
* VS Code extension,
* GitHub integration,
* CI enforcement,
* team policies,
* cloud synchronization,
* analytics,
* enterprise administration,
* hosted memory,
* advanced code graph,
* marketplace.

---

# 61. Development Roadmap

## Phase 0 — Product validation

**1 week**

Deliver:

* decision taxonomy,
* UX flows,
* competitor analysis,
* test scenarios,
* prototype conversations.

---

## Phase 1 — Core state machine

**1–2 weeks**

Build:

* task object,
* events,
* state transitions,
* resume.

---

## Phase 2 — Project understanding

**1–2 weeks**

Build:

* scanner,
* project map,
* convention inference,
* context retrieval.

---

## Phase 3 — Decision Engine

**1–2 weeks**

Build:

* consequentiality detection,
* memory lookup,
* ambiguity detection,
* question generation,
* human decision recording.

---

## Phase 4 — Memory Engine

**1–2 weeks**

Build:

* decisions,
* conventions,
* state,
* lessons,
* provenance,
* conflict detection.

---

## Phase 5 — Scope + Consistency

**1–2 weeks**

Build:

* approved scope,
* file tracking,
* architecture comparison,
* deviation detection,
* change-of-plan flow.

---

## Phase 6 — Proof Engine

**1 week**

Build:

* plan/result comparison,
* verification,
* evidence collection,
* completion report.

---

## Phase 7 — Real Agent Integration

**1–2 weeks**

Integrate first agent.

---

## Phase 8 — Dogfooding

**2+ weeks**

Use Checkpoint to build Checkpoint.

Track every annoying interaction.

Remove unnecessary friction.

---

# 62. First Prototype Deliverable

The first thing we should actually produce is **not the finished CLI**.

It should be:

### Checkpoint Core Prototype

Given:

```text
repository
+
task
+
agent actions
```

it produces:

```text
understanding
+
context
+
plan
+
decisions
+
scope
+
deviations
+
verification
+
memory
```

If this works reliably, we have the heart.

---

# 63. Long-Term Product Architecture

Eventually:

```text
                         CHECKPOINT
                              │
                   ┌──────────┴──────────┐
                   │                     │
              CORE ENGINE           PROJECT STATE
                   │                     │
       ┌───────────┼───────────┐         │
       │           │           │         │
   Decision     Memory      Consistency  │
    Engine      Engine        Engine     │
       │           │           │         │
       └───────────┼───────────┘         │
                   │                     │
              Agent Protocol             │
                   │                     │
        ┌──────────┼──────────┐          │
        ↓          ↓          ↓          │
      Codex      Claude     Cursor       │
                   │                     │
                   └──────────┬──────────┘
                              ↓
                           Git / CI
```

---

# 64. The Long-Term Differentiator

Checkpoint should not be known as:

> "The AI approval tool."

That is too narrow.

It should become:

> **The engineering memory and decision layer for AI-assisted software development.**

Its unique behavior:

```text
New project
    ↓
More questions
    ↓
Human decisions
    ↓
Project learns
    ↓
Fewer questions
    ↓
Better consistency
    ↓
Smarter interruptions
    ↓
More trust
```

The system becomes **quieter as it gets smarter.**

---

# 65. Product Mantra

Everything we build should pass this test:

> **Does this improve the quality of human attention without unnecessarily reducing AI speed?**

If yes → consider building it.

If it adds bureaucracy → reject it.

If it makes the developer repeatedly do something the system can learn → reject it.

If it helps the system understand the project → strong candidate.

If it preserves an important engineering decision → strong candidate.

If it catches an important deviation → strong candidate.

---

# 66. Final Product Definition

### Checkpoint is:

**A local-first, project-level engineering workflow layer for AI coding agents.**

It:

* understands the project,
* understands the developer's intent,
* identifies consequential decisions,
* asks only when human judgment matters,
* remembers confirmed decisions,
* learns project conventions,
* detects architectural and scope deviations,
* challenges inconsistent choices,
* verifies actual changes,
* and maintains a durable engineering state independent of the AI agent.

### It is not:

* another coding agent,
* another chatbot,
* another code-review bot,
* another approval form,
* or another memory file.

---

## The build order I recommend

We now have enough product clarity to stop discussing the idea abstractly.

The next phase should be **technical design**, in this exact order:

```text
PRD
 ↓
1. Domain model
 ↓
2. State machine
 ↓
3. Decision model
 ↓
4. Memory schema
 ↓
5. Event model
 ↓
6. Repository analysis pipeline
 ↓
7. Decision Engine algorithm
 ↓
8. Scope/Consistency Engine
 ↓
9. Agent protocol
 ↓
10. Prototype
 ↓
11. Dogfood
```
