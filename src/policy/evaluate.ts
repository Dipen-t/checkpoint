import type { DiffHunk } from "../engines/evidence/diff-policy.js";
import type { CheckpointPolicy } from "./schema.js";

export type Verdict = "allow" | "warn" | "block" | "needs_approval";

export type Finding = {
  ruleId: string;
  verdict: Exclude<Verdict, "allow">;
  file: string;
  message: string;
};

export function pathMatches(pattern: string, file: string): boolean {
  const norm = file.replaceAll("\\", "/").replace(/^\.\//, "");
  const body = pattern
    .replaceAll("\\", "/")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\/\*\*/g, "\u0002")
    .replaceAll("**", "\u0003")
    .replaceAll("*", "\u0004")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("\u0001", "(?:.*/)?")
    .replaceAll("\u0002", "(?:/.*)?")
    .replaceAll("\u0003", ".*")
    .replaceAll("\u0004", "[^/]*");
  return new RegExp(`^${body}$`, "i").test(norm);
}

function matchesAny(patterns: string[], file: string): boolean {
  return patterns.some((pattern) => pathMatches(pattern, file));
}

/** High-confidence tokens only, the same cut GitLab uses for secret push protection. */
const SECRET_LINES: Array<{ id: string; pattern: RegExp; label: string }> = [
  { id: "secret-aws-key", pattern: /AKIA[0-9A-Z]{16}/, label: "an AWS access key" },
  { id: "secret-github-token", pattern: /ghp_[A-Za-z0-9]{20,}/, label: "a GitHub token" },
  { id: "secret-gitlab-token", pattern: /glpat-[A-Za-z0-9_-]{20,}/, label: "a GitLab token" },
  {
    id: "secret-private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    label: "a private key",
  },
  { id: "secret-slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/, label: "a Slack token" },
];

function exceptionApplies(
  policy: CheckpointPolicy,
  ruleId: string,
  file: string,
  now: Date,
): boolean {
  return policy.exceptions.some((item) => {
    if (item.ruleId !== ruleId) return false;
    if (!pathMatches(item.path, file) && item.path !== file) return false;
    const expires = Date.parse(item.expires);
    return Number.isFinite(expires) && expires > now.getTime();
  });
}

export function evaluatePolicy(
  policy: CheckpointPolicy,
  hunks: DiffHunk[],
  now = new Date(),
): Finding[] {
  const findings: Finding[] = [];

  for (const hunk of hunks) {
    const file = hunk.file.replaceAll("\\", "/");

    const base = file.split("/").pop();
    const protectedFile = base === "checkpoint.policy.json" || base === "checkpoint.pub";
    if (protectedFile || matchesAny(policy.approvalRequired, file)) {
      const named = policy.reviewers.length > 0 ? ` from ${policy.reviewers.join(", ")}` : "";
      findings.push({
        ruleId: "approval-required",
        verdict: "needs_approval",
        file,
        message: `${file} needs a person${named} to approve this diff.`,
      });
    }

    for (const secret of SECRET_LINES) {
      if (!hunk.addedLines.some((added) => secret.pattern.test(added))) continue;
      findings.push({
        ruleId: secret.id,
        verdict: "block",
        file,
        message: `${file} adds ${secret.label}. The value is not stored.`,
      });
    }

    for (const rule of policy.imports) {
      if (matchesAny(rule.allowPaths, file)) continue;
      if (!matchesAny(rule.denyPaths, file)) continue;
      const line = hunk.addedLines.find((added) =>
        rule.denyLine.some((needle) => added.toLowerCase().includes(needle.toLowerCase())),
      );
      if (!line) continue;
      const expiredBypass = exceptionApplies(policy, rule.id, file, now);
      findings.push({
        ruleId: rule.id,
        verdict: expiredBypass || rule.severity === "warn" ? "warn" : "block",
        file,
        message: rule.message,
      });
    }
  }

  return findings;
}

/**
 * GitLab does not let the author approve their own merge. A protected diff stays blocked
 * when no other reviewer is named.
 */
export function secondPersonGap(
  policy: CheckpointPolicy,
  authorEmail: string,
  findings: Finding[],
): Finding | null {
  if (!policy.requireReviewer) return null;
  const sensitive = findings.some(
    (item) => item.verdict === "block" || item.verdict === "needs_approval",
  );
  if (!sensitive) return null;
  const author = authorEmail.trim().toLowerCase();
  if (!author) {
    return {
      ruleId: "author-unnamed",
      verdict: "block",
      file: "",
      message: "git user.email is empty. The record has to name a person.",
    };
  }
  const others = policy.reviewers.filter((reviewer) => reviewer.toLowerCase() !== author);
  if (others.length > 0) return null;
  return {
    ruleId: policy.reviewers.length === 0 ? "reviewers-required" : "author-cannot-self-approve",
    verdict: "block",
    file: "",
    message:
      policy.reviewers.length === 0
        ? "Name a reviewer who is not the author. The author alone cannot clear this."
        : `${authorEmail} is the only reviewer. Someone else has to be named.`,
  };
}
