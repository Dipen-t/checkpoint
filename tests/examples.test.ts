import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseDiffHunks } from "../src/engines/evidence/diff-policy.js";
import { evaluatePolicy } from "../src/policy/evaluate.js";
import { parsePolicy } from "../src/policy/schema.js";

const examplesDir = path.join(import.meta.dirname, "../examples");

describe("example policies", () => {
  test("every example file is a policy someone can commit", async () => {
    const names = (await readdir(examplesDir)).filter((name) => name.endsWith(".json"));
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const name of names) {
      const raw = await readFile(path.join(examplesDir, name), "utf8");
      expect(parsePolicy(raw).version).toBe(1);
    }
  });

  test("a view that calls the database trips the example rule", async () => {
    const raw = await readFile(path.join(examplesDir, "your-rule.json"), "utf8");
    const policy = parsePolicy(raw);
    const hunks = parseDiffHunks(
      ["+++ b/resources/views/orders.php\n+mysqli_query($db, $sql);\n"],
      [],
    );
    expect(evaluatePolicy(policy, hunks)[0]?.ruleId).toBe("views-do-not-query");
  });
});
