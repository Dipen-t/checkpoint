# Contributing to Checkpoint

Checkpoint is a local gate. A repository commits `checkpoint.policy.json`. `checkpoint check` reads `git diff HEAD` and exits 2 when that policy says to block. The agent's plan cannot clear a block.

Issues and pull requests are welcome. The useful change is a smaller rule, a clearer document, or a test that locks a failure. A model that can talk a block into a pass is not a change we take.

## Set up

```bash
git clone https://github.com/mohit131415/checkpoint.git
cd checkpoint
npm install
npm test
npm run typecheck
```

Run one command while you work:

```bash
npm run dev -- check
npm run dev -- adopt local
```

`npm run lint` checks `src/` with Biome.

## What lives where

| Path | What it is |
| --- | --- |
| `src/policy/` | The file people commit. Profiles, path rules, secrets, the CI witness. |
| `src/commands/check.ts` | Reads the diff, writes the ledger line, sets the exit code. |
| `src/ledger/` | Hash chain and the signature. The private key stays outside the repo. |
| `src/commands/adopt.ts` | Writes a profile. It does not overwrite a policy that is already there. |
| `examples/` | Policies a person can copy. Every JSON file in here must parse. |
| `tests/` | The bar. Add a test next to the behavior you change. |

`src/engines/` still holds decision, memory, consistency, and verification. Those explain an older plan. They do not override a diff finding.

## Add a rule

Put one object in `imports`. `denyPaths` is where the line is forbidden. `allowPaths` is where the same line is allowed. `denyLine` is text on an added line. Copy the shape from [examples/your-rule.json](examples/your-rule.json).

Then add a test that feeds a small diff through `evaluatePolicy` and expects the rule id. Do not put a real token, password, or private key in the test. The secret tests build a fake `ghp_` string in code.

## Pull requests

1. `npm test` passes.
2. `npm run typecheck` passes.
3. A behavior change has a test.
4. A new command or profile is in `README.md`.
5. The ledger assertion does not contain a secret value.

Open the pull request against `main`. Say what failed before and what the diff proves now.

## Report a bug

Include the profile (`local`, `team`, or `house`), the command, the exit code, and a diff with secrets removed. A plan sentence is not enough. The check judges the diff.
