import { describe, expect, test } from "vitest";
import { parseDiffHunks } from "../src/engines/evidence/diff-policy.js";
import { evaluatePolicy, secondPersonGap } from "../src/policy/evaluate.js";
import { GENERIC_POLICY } from "../src/policy/schema.js";

const workflow = `+++ b/.github/workflows/ci.yml
+name: ci
`;

describe("generic policy", () => {
  test("a normal edit in any repository is allowed", () => {
    const hunks = parseDiffHunks([`+++ b/src/app.ts\n+export const n = 1;\n`], []);
    expect(evaluatePolicy(GENERIC_POLICY, hunks)).toEqual([]);
  });

  test("a GitHub token on an added line blocks and the value is not copied", () => {
    const token = `ghp_${"a".repeat(36)}`;
    const hunks = parseDiffHunks([`+++ b/src/app.ts\n+const key = "${token}";\n`], []);
    const finding = evaluatePolicy(GENERIC_POLICY, hunks)[0];
    expect(finding?.ruleId).toBe("secret-github-token");
    expect(finding?.verdict).toBe("block");
    expect(finding?.message).not.toContain(token);
  });

  test("a workflow file needs a person in a repository with no house rules", () => {
    const finding = evaluatePolicy(GENERIC_POLICY, parseDiffHunks([workflow], []))[0];
    expect(finding?.verdict).toBe("needs_approval");
    expect(finding?.ruleId).toBe("approval-required");
  });

  test("the author cannot be the only named reviewer", () => {
    const findings = evaluatePolicy(GENERIC_POLICY, parseDiffHunks([workflow], []));
    const alone = secondPersonGap(
      { ...GENERIC_POLICY, reviewers: ["dev@example.com"] },
      "dev@example.com",
      findings,
    );
    expect(alone?.ruleId).toBe("author-cannot-self-approve");

    const named = secondPersonGap(
      { ...GENERIC_POLICY, reviewers: ["dev@example.com", "sec@example.com"] },
      "dev@example.com",
      findings,
    );
    expect(named).toBeNull();
  });
});
