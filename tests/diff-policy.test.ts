import { describe, expect, test } from "vitest";
import { boundaryDeviations, parseDiffHunks } from "../src/engines/evidence/diff-policy.js";
import { ScopeEngine } from "../src/engines/scope/index.js";
import { ConsistencyEngine } from "../src/engines/consistency/index.js";
import { VerificationEngine } from "../src/engines/verification/index.js";
import { FallbackProvider } from "../src/llm/provider.js";
import { randomUUID } from "node:crypto";

const controllerDiff = `diff --git a/src/controllers/user.controller.ts b/src/controllers/user.controller.ts
--- a/src/controllers/user.controller.ts
+++ b/src/controllers/user.controller.ts
@@ -1,2 +1,3 @@
+import { prisma } from "../database/client";
 export function read() { return prisma.user.findMany(); }
`;

describe("diff is the decision", () => {
  test("a quiet plan cannot hide a database call in a controller", async () => {
    const verification = new VerificationEngine(new ScopeEngine(), new ConsistencyEngine(new FallbackProvider()));
    const result = await verification.verify(
      {
        id: randomUUID(),
        taskId: randomUUID(),
        proposedSteps: ["Fix a typo in the welcome text."],
        affectedComponents: [],
        status: "APPROVED",
      },
      {
        id: randomUUID(),
        planId: randomUUID(),
        allowedFiles: ["src/controllers/user.controller.ts"],
        allowedDirectories: ["src/controllers"],
        explicitlyForbidden: [],
      },
      {
        claim: { modifiedFiles: ["src/controllers/user.controller.ts"], description: "Fix a typo" },
        observed: {
          gitDiffs: [controllerDiff],
          modifiedFiles: ["src/controllers/user.controller.ts"],
          testResults: "PASSED",
        },
      },
      [],
    );

    expect(result.status).toBe("REQUIRES_REVIEW");
    expect(result.detectedDeviations.some((item) => item.description.includes("Prisma stays in Services"))).toBe(true);
  });

  test("the same call inside a repository is allowed", () => {
    const hunks = parseDiffHunks([
      `+++ b/src/repositories/user.repository.ts\n+import { prisma } from "../database/client";\n`,
    ], []);
    expect(boundaryDeviations(hunks)).toEqual([]);
  });

  test("a schema file and a new framework dependency are caught from the diff", () => {
    const hunks = parseDiffHunks([
      `+++ b/prisma/schema.prisma\n+model User { id Int }\n`,
      `+++ b/package.json\n+    "express": "^4.21.0",\n`,
    ], []);
    const found = boundaryDeviations(hunks).map((item) => item.description);
    expect(found.some((line) => line.includes("data model"))).toBe(true);
    expect(found.some((line) => line.includes("express"))).toBe(true);
  });

  test("the same diff produces the same verdict", () => {
    const hunks = parseDiffHunks([controllerDiff], []);
    expect(boundaryDeviations(hunks)).toEqual(boundaryDeviations(parseDiffHunks([controllerDiff], [])));
  });
});
