import { describe, expect, test } from "vitest";
import { splitAdoptArgs } from "../src/commands/adopt.js";
import { parseDiffHunks } from "../src/engines/evidence/diff-policy.js";
import { evaluatePolicy, secondPersonGap } from "../src/policy/evaluate.js";
import { LOCAL_POLICY, parsePolicy, policyForProfile } from "../src/policy/schema.js";
import { witnessGap } from "../src/policy/witness.js";

describe("profiles", () => {
  test("local, team, and house are different presets of the same file", () => {
    expect(policyForProfile("local").witness).toBe("local");
    expect(policyForProfile("local").requireReviewer).toBe(false);
    expect(policyForProfile("team").witness).toBe("ci");
    expect(policyForProfile("team").requireReviewer).toBe(true);
    expect(policyForProfile("house").imports.map((rule) => rule.id)).toContain(
      "prisma-stays-in-services",
    );
  });

  test("a local profile blocks a token and does not demand a second reviewer or CI", () => {
    const token = `ghp_${"b".repeat(36)}`;
    const hunks = parseDiffHunks([`+++ b/src/app.ts\n+const key = "${token}";\n`], []);
    const findings = evaluatePolicy(LOCAL_POLICY, hunks);
    expect(findings[0]?.ruleId).toBe("secret-github-token");
    expect(secondPersonGap(LOCAL_POLICY, "dev@example.com", findings)).toBeNull();
    expect(witnessGap(LOCAL_POLICY.witness, false)).toBeNull();
  });

  test("an old policy file without the new fields still loads", () => {
    const policy = parsePolicy('{"version":1,"imports":[]}');
    expect(policy.profile).toBe("local");
    expect(policy.witness).toBe("local");
    expect(policy.requireReviewer).toBe(false);
  });

  test("adopt accepts the profile before or after the path", () => {
    expect(splitAdoptArgs("local", "/tmp/app")).toEqual({ profile: "local", root: "/tmp/app" });
    expect(splitAdoptArgs("/tmp/app", "house")).toEqual({ root: "/tmp/app", profile: "house" });
    expect(splitAdoptArgs("/tmp/app")).toEqual({ root: "/tmp/app" });
  });
});
