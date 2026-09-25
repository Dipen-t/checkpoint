import { describe, expect, test } from "vitest";
import { parseDiffHunks } from "../src/engines/evidence/diff-policy.js";
import { evaluatePolicy } from "../src/policy/evaluate.js";
import { HOUSE_POLICY, parsePolicy } from "../src/policy/schema.js";

const controller = `+++ b/server/src/Controllers/user.controller.js
+  const rows = await prisma.users.findMany();
`;
const service = `+++ b/server/src/Services/user/list.service.js
+  return prisma.users.findMany();
`;

describe("house policy", () => {
  test("Prisma in a controller blocks, Prisma in a service does not", () => {
    const findings = evaluatePolicy(HOUSE_POLICY, parseDiffHunks([controller, service], []));
    expect(findings.map((item) => item.file)).toEqual([
      "server/src/Controllers/user.controller.js",
    ]);
    expect(findings[0]?.verdict).toBe("block");
    expect(findings[0]?.message).toContain("Services, Utils, or Database");
  });

  test("an expired exception does not clear a block", () => {
    const policy = {
      ...HOUSE_POLICY,
      exceptions: [
        {
          ruleId: "prisma-stays-in-services",
          path: "**/Controllers/**",
          reason: "old bypass",
          expires: "2020-01-01T00:00:00Z",
        },
      ],
    };
    const findings = evaluatePolicy(
      policy,
      parseDiffHunks([controller], []),
      new Date("2026-09-25T00:00:00Z"),
    );
    expect(findings[0]?.verdict).toBe("block");
  });

  test("a missing version fails closed", () => {
    expect(() => parsePolicy("{}")).toThrow(/version/);
  });

  test("replacing the public key needs a person", () => {
    const hunks = parseDiffHunks([`+++ b/checkpoint.pub\n+-----BEGIN PUBLIC KEY-----\n`], []);
    const policy = { ...HOUSE_POLICY, approvalRequired: [] };
    expect(evaluatePolicy(policy, hunks)[0]?.verdict).toBe("needs_approval");
  });

  test("a website file cannot import Prisma", () => {
    const hunks = parseDiffHunks(
      [`+++ b/website/src/services/orders.js\n+import { PrismaClient } from "@prisma/client";\n`],
      [],
    );
    expect(evaluatePolicy(HOUSE_POLICY, hunks)[0]?.verdict).toBe("block");
  });
});
