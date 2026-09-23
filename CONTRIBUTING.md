# Contributing to Checkpoint

First off, thank you for considering contributing to Checkpoint! 🛑

Checkpoint is designed to be the local-first, zero-dependency middleware for AI coding agents. Whether you want to add support for a new LLM provider, improve the BM25 memory engine, or fix a bug, your help is welcome.

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Dipen-t/checkpoint.git
   cd checkpoint
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the tests**
   Checkpoint uses `vitest` for extremely fast, isolated unit and integration testing. We maintain a strict test suite that mocks out the filesystem and LLMs to ensure the Core Engines behave deterministically.
   ```bash
   npm run test
   ```

4. **Build the CLI**
   ```bash
   npm run build
   ```
   *You can also run the CLI in development mode using `npm run dev -- <command>`*.

## Architecture Overview

Checkpoint is organized into 4 distinct engines located in `src/engines/`:
- **Decision Engine**: Parses agent implementation plans (AST/RegEx) to apply proactive guardrails.
- **Memory Engine**: Pure-TypeScript BM25 algorithm to dynamically inject local `.checkpoint/memory` rules into prompts.
- **Consistency Engine**: Uses the LLM provider to semantically verify that git diffs don't violate architectural memory.
- **Verification Engine**: Compares the agent's tool call claims against raw `git diff` outputs to catch scope drift.

## Pull Request Process

1. Ensure all 68+ tests pass (`npm run test`).
2. Add new tests for any new Engine heuristics or LLM evaluation boundaries.
3. Update the `README.md` if you are changing the CLI surface area.
4. Open a PR with a clear description of the problem you are solving (e.g. "Fixes false positive on data model regex").

Thank you for helping us keep AI agents strictly in line! 🚀
