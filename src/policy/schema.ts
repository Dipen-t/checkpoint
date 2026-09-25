export type PolicyRule = {
  id: string;
  severity: "error" | "warn";
  denyPaths: string[];
  allowPaths: string[];
  denyLine: string[];
  message: string;
};

export type ProfileName = "local" | "team" | "house";

export type CheckpointPolicy = {
  version: 1;
  default: "deny";
  /** Which preset was written. Edit the fields below to change it. */
  profile: ProfileName;
  /** People who may approve a protected diff. The author alone is not enough. */
  reviewers: string[];
  /** When true, a block stays blocked until a reviewer other than the author is named. */
  requireReviewer: boolean;
  /** ci means a pull-request job must exist in git. local is a laptop-only record. */
  witness: "ci" | "local";
  imports: PolicyRule[];
  approvalRequired: string[];
  exceptions: Array<{ ruleId: string; path: string; reason: string; expires: string }>;
};

const SHARED_APPROVAL = [
  "checkpoint.policy.json",
  "checkpoint.pub",
  ".github/workflows/**",
  "**/.github/workflows/**",
  ".github/CODEOWNERS",
  "**/CODEOWNERS",
  ".gitlab-ci.yml",
  "**/.gitlab-ci.yml",
];

/** Laptop record. Secrets still block. CI and a second reviewer stay off until you turn them on. */
export const LOCAL_POLICY: CheckpointPolicy = {
  version: 1,
  default: "deny",
  profile: "local",
  reviewers: [],
  requireReviewer: false,
  witness: "local",
  imports: [],
  approvalRequired: SHARED_APPROVAL,
  exceptions: [],
};

/**
 * Rules any repository can commit. Same shape as a GitHub ruleset and a GitLab push rule:
 * protected files need a named reviewer, and secret lines are blocked in code.
 */
export const GENERIC_POLICY: CheckpointPolicy = {
  ...LOCAL_POLICY,
  profile: "team",
  requireReviewer: true,
  witness: "ci",
};

/** House profile from the masys and dancedemo servers: Prisma stays in Services, Utils, or Database. */
export const HOUSE_POLICY: CheckpointPolicy = {
  ...GENERIC_POLICY,
  profile: "house",
  imports: [
    {
      id: "prisma-stays-in-services",
      severity: "error",
      denyPaths: [
        "**/Controllers/**",
        "**/Routing/**",
        "**/Http/**",
        "**/Middleware/**",
        "**/client/**",
        "**/website/**",
      ],
      allowPaths: [
        "**/server/src/Services/**",
        "**/server/src/Utils/**",
        "**/server/src/Database/**",
      ],
      denyLine: ["prisma", "@prisma/client", "Database/connection"],
      message:
        "Prisma stays in Services, Utils, or Database. Controllers, routes, and the website call those services.",
    },
  ],
  approvalRequired: [
    ...SHARED_APPROVAL,
    "**/prisma/schema.prisma",
    "**/prisma/migrations/**",
    "**/.env",
    "**/login.php",
    "**/config.php",
    "**/env.php",
  ],
};

export function policyForProfile(profile: ProfileName): CheckpointPolicy {
  if (profile === "local") return LOCAL_POLICY;
  if (profile === "house") return HOUSE_POLICY;
  return GENERIC_POLICY;
}

export function parsePolicy(raw: string): CheckpointPolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("checkpoint.policy.json is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object")
    throw new Error("checkpoint.policy.json must be an object.");
  const policy = parsed as Partial<CheckpointPolicy>;
  if (policy.version !== 1) throw new Error("checkpoint.policy.json version must be 1.");
  if (!Array.isArray(policy.imports))
    throw new Error("checkpoint.policy.json needs an imports list.");
  const reviewers = Array.isArray(policy.reviewers)
    ? policy.reviewers.filter((item): item is string => typeof item === "string")
    : [];
  if (policy.witness !== undefined && policy.witness !== "ci" && policy.witness !== "local") {
    throw new Error("checkpoint.policy.json witness must be ci or local.");
  }
  const witness = policy.witness === "ci" ? "ci" : "local";
  const profile = policy.profile;
  if (profile !== undefined && profile !== "local" && profile !== "team" && profile !== "house") {
    throw new Error("checkpoint.policy.json profile must be local, team, or house.");
  }
  return {
    version: 1,
    default: "deny",
    profile: profile ?? (witness === "ci" ? "team" : "local"),
    reviewers,
    requireReviewer:
      typeof policy.requireReviewer === "boolean" ? policy.requireReviewer : witness === "ci",
    witness,
    imports: policy.imports,
    approvalRequired: policy.approvalRequired ?? [],
    exceptions: policy.exceptions ?? [],
  };
}
