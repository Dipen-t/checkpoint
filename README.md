# Checkpoint

Local gate for any git repository. You commit a policy file. Checkpoint reads the git diff and blocks the change when that policy says so. The agent's plan cannot clear a block.

The best setup is the one that matches how you work. Same command, different file. Secrets in an added line block in every profile. The token is not written into the ledger.

- [One person](#if-you-are-one-person)
- [A team](#if-you-merge-with-other-people)
- [House servers](#if-you-run-the-house-servers)
- [Your own rule](#if-you-want-your-own-rule)
- [A company](#if-you-are-deciding-for-a-company)
- [A script, not a sentence](#if-you-do-not-trust-a-sentence-in-a-prompt)
- [The policy file](#the-file)
- [What a pass guarantees](#what-a-pass-guarantees)
- [Ledger](#ledger)
- [Commands](#commands)
- [Contributing](#contributing)

## If you are one person

A class project, a laptop, a first repo. You want a record and a stop on tokens. You do not want a pull-request job yet.

```bash
npx checkpoint adopt local
npx checkpoint check
```

Copy [examples/student.json](examples/student.json) if you would rather start from a file. `witness` stays `local`. `requireReviewer` stays `false`. A normal edit in `src/` passes. A GitHub or GitLab token does not.

## If you merge with other people

You want the laptop check and a second computer. GitHub or GitLab runs the same check. The author cannot be the only name on a protected diff.

```bash
npx checkpoint adopt team
```

Then put a real email in `reviewers`, commit `.github/workflows/checkpoint.yml` or `.gitlab-ci.checkpoint.yml`, and require the status check named `checkpoint` before merge. [examples/team.json](examples/team.json) is that file with a placeholder email. Deleting the workflow is a block.

This is the same shape as a [GitHub ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) and a [GitLab push rule](https://docs.gitlab.com/user/project/repository/push_rules/). Checkpoint does not replace those hosts. It is the check they run.

## If you run the house servers

Prisma stays in Services, Utils, or Database. Controllers, routes, middleware, `client/`, and `website/` do not get new Prisma calls. Login on those APIs is `POST /api/auth/login`.

```bash
npx checkpoint adopt house
```

With no profile name, a repo that has `Services` and `Controllers` side by side gets this. Every other repo gets `team`.

## If you want your own rule

Any stack. One object in `imports`. `denyPaths` is where the line is forbidden. `allowPaths` is where the same line is fine. `denyLine` is the text on an added line.

[examples/your-rule.json](examples/your-rule.json) blocks `eval(`, `mysqli_query`, and `prisma.` inside views, templates, and pages. Paste that object into your policy and change the words.

```json
{
  "id": "views-do-not-query",
  "severity": "error",
  "denyPaths": ["**/views/**", "**/templates/**"],
  "allowPaths": [],
  "denyLine": ["eval(", "mysqli_query"],
  "message": "Views render. Queries stay in the service that owns them."
}
```

`severity` may be `error` or `warn`. An `exceptions` entry needs a rule id, a path, a reason, and an `expires` time. A past date does not clear the block.

## If you are deciding for a company

The record is a signed line: the policy, the diff, and the public key, chained to the line before it. A rewritten line fails. A hash that git already committed cannot be dropped. A copied private key can still append. A force-push removes the old tip on the remote.

Turn on `team`, name a reviewer who is not the author, and require the `checkpoint` status check before merge. That job is the second computer. The ledger still starts on the machine that ran the check.

## If you do not trust a sentence in a prompt

Exit 2 blocks. Exit 0 allows. The hook reads `git diff HEAD`, including staged files. A file git is not tracking does not pass. A deny phrase in the agent's instructions is not this check. That is the same note working developers made about agent hooks: a script, not a sentence. Tools with this shape include [archlint](https://github.com/muhammetsafak/archlint), [RepoContract](https://github.com/dager23/RepoContract), [Cursor hooks](https://cursor.com/docs/hooks), and [OPA's default deny](https://openpolicyagent.org/docs/faq).

## The file

`checkpoint.policy.json` is the whole setup. `checkpoint adopt` does not overwrite a policy that is already there. Change it by editing the file.

| Field | What it does |
| --- | --- |
| `witness` | `local` keeps the record on the laptop. `ci` requires `.github/workflows/checkpoint.yml` or `.gitlab-ci.checkpoint.yml` in git. |
| `requireReviewer` | `true` means a block stays blocked until `reviewers` names someone other than `git user.email`. |
| `reviewers` | Emails of the people who may approve a protected diff. |
| `imports` | Your own path and line rules. |
| `approvalRequired` | Paths that need a person. Policy, CI, and CODEOWNERS are already listed. |
| `exceptions` | A rule id, a path, a reason, and an `expires` time. A past date does not clear the block. |

Run the check with:

```bash
npx checkpoint adopt
npx checkpoint check
```

`check` exits 2 on a block, which is the deny code Cursor and Claude Code hooks already understand. It reads `git diff HEAD`, so a staged file is visible. A file git is not tracking does not pass. Each run appends one signed line to `.checkpoint/ledger.jsonl`, including a refusal. The line stores SHA-256 values and not the file contents:

- `policyDigest` — the exact policy file
- `diffDigest` — the exact `git diff HEAD`
- `keyDigest` — the exact `checkpoint.pub`
- `subject` — those three together

Change the policy, the diff, or the public key and the subject changes. An old allow does not cover the new edit. This is the binding used by [GitPin](https://github.com/shmindmaster/gitpin) and [agentledger](https://github.com/dembovvski/agentledger). [in-toto Witness](https://github.com/in-toto/witness/) and [SLSA](https://slsa.dev/spec/v1.1/verifying-artifacts) also require a signature from a key that is not the record itself. `checkpoint adopt` writes `checkpoint.pub` in the repo and an Ed25519 private key under your home directory. Each ledger line is signed with that private key. It also writes `checkpoint.anchor`, the ledger tip committed in git. A later signature can add a line. It cannot drop a hash that `HEAD` or the upstream branch already named. That is the inclusion check a transparency log gives you, kept in the repo you already push. If someone copies the private key, they can still append. If they also force-push the remote, the old tip is gone there too.

## What a pass guarantees

| Check | What “pass” means |
| --- | --- |
| Tamper-evident record | Each line includes the hash of the line before it, and a signature from the private key. Editing a line, or rewriting the chain, fails the check. |
| Committed tip cannot be erased | `checkpoint.anchor` in `HEAD`, and on the upstream branch when one exists, must still be in the ledger. A new signature cannot drop it. |
| Unseen files do not pass | `git diff HEAD` includes staged edits. A file git is not tracking is a block. |
| No secrets in the record | Passwords, tokens, and API keys are removed before the line is hashed. |
| Critical blocks stay blocked | A model explanation cannot clear a critical or high-impact block. |
| A failed check asks for review | If the consistency check cannot run, the result is review, not a pass. |
| Tests must be observed | Changed files plus `testResults: "UNKNOWN"` cannot pass. |
| The agent’s file list is not trusted | A file in git that the agent did not claim is a critical mismatch. |
| A quiet plan cannot hide a code change | A database call added in a controller is blocked even when the plan says “fix a typo.” |
| Secrets in the diff | A high-confidence token or private key on an added line blocks in every repository. |
| The author is not the only reviewer | When `requireReviewer` is true, a protected diff stays blocked until `reviewers` names someone other than `git user.email`. |

`npm test` includes `tests/accountability.test.ts`, which locks this bar.

Open-ended “was this good code?” is outside the score. The score is whether a consequential change can land with no evidence and no human.

## Why this shape

The design follows primary sources, not a slogan.

- [OWASP Top 10:2025 A09](https://owasp.org/Top10/2025/A09_2025-Security_Logging_and_Alerting_Failures/) — log security decisions whether they succeed or fail, and keep an audit trail that can show tampering. Fail closed.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — log authentication successes and failures, and do not write credentials into logs.
- [OWASP ASVS 16.3](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md) — log authentication and authorization decisions.
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) — treat tool calls as untrusted, keep immutable logs, and fail closed when a tool or a check is ambiguous (ASI02).
- [Microsoft Agent Governance Toolkit ADR-0017](https://microsoft.github.io/agent-governance-toolkit/adr/0017-merkle-chain-for-audit-tamper-evidence/) — a SHA-256 hash chain detects edits, deletions, and reordering without a blockchain.

A hash chain shows that the file changed. It does not by itself prove who holds the disk. Keep the `.checkpoint` directory in git if you want history across machines.

## Ledger

`.checkpoint/ledger.jsonl` is append-only. Each line stores:

- sequence, time, type, source (`AGENT`, `SYSTEM`, or `HUMAN`)
- the payload, with secret fields removed
- `prevHash` and `hash` (SHA-256 over the canonical JSON of the other fields)
- `signature` from the private key, checked against `checkpoint.pub`

```bash
npx checkpoint ledger
```

`intact` means every line still matches its predecessor and its signature matches `checkpoint.pub`. `broken at record N` means that line, or something before it, was edited or resigned by another key. `checkpoint check` also requires the hash in `checkpoint.anchor` at `HEAD` and, when the branch has an upstream, the hash on that upstream.

The decision engine writes a line for each plan check when it is given the project directory. The workflow writes a line on each state change.

## What the engines do

The plan is a claim. The git diff is the evidence. [OWASP’s agent list](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) says to separate planning from execution and to show the diff before a high-impact change lands. Tools such as [archlint](https://github.com/muhammetsafak/archlint) and [RepoContract](https://github.com/dager23/RepoContract) do that without a model: they read added lines and fail on a forbidden import.

1. **Verification.** Reads `checkpoint.policy.json` and the git diff. On your servers, a new Prisma call is allowed in Services, Utils, and Database, and blocked in Controllers, routes, middleware, and the website. A schema, migration, `.env`, or `login.php` edit needs a person. Unclaimed files and unseen tests still block.
2. **Check.** `checkpoint check` is the command a hook or CI runs. Exit 0 means allow. Exit 2 means block. A missing or invalid policy exits 2.
3. **Consistency.** Project rules are compared with the diff. If that check errors, the verdict is review.
4. **Memory.** Confirmed decisions live in `.checkpoint/memory` and are retrieved with BM25. Retrieval explains which rule applies. It does not override a diff finding.

## Login

`checkpoint login [project]` keeps `POST /api/auth/login` and records every try in `server/.checkpoint/auth/ledger.jsonl`.

Saved: time, outcome, reason, who. Not saved: the password. A wrong user and a wrong password still show the same message.

```bash
npx checkpoint login
```

In chat, `/login` runs that command.

## Quickstart

```bash
npm install -g nah-checkpoint
```

Then, in the agent:

```text
/checkpoint init
/checkpoint status
/checkpoint verify
/checkpoint adopt local|team|house
/checkpoint check
/checkpoint ledger
/login
```

Checkpoint is quiet on routine steps that match an allow rule. It stops the agent when a decision is required and stores the answer so the same question is not asked again for that scope.

## Commands

```text
checkpoint init
checkpoint status
checkpoint verify
checkpoint adopt [path] [local|team|house]
checkpoint check [path]
checkpoint ledger
checkpoint login [path]
checkpoint decisions
checkpoint explain
checkpoint doctor
checkpoint inspect
```

`doctor` checks the project layout and, when a ledger exists, that its chain is intact.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Clone the repo, run `npm test` and `npm run typecheck`, and open a pull request against `main`. A new rule belongs in `examples/` and in a test. Do not put a real secret in either.

Bug reports need the profile, the command, and a diff with secrets removed. The template is in [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md).

## v0.1 scope

This build is for dogfooding. It does not replace your agent, your git host, or CI. There is no hosted model in the default provider: if a semantic check cannot run, a high-impact result stays on the deterministic rule, and a consistency failure stays on review.

## License

MIT
