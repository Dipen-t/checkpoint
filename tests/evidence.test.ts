import { describe, expect, test } from "vitest";
import { bindCheck, sha256 } from "../src/policy/evidence.js";

describe("check binding", () => {
  test("the same policy and the same diff always bind to the same subject", () => {
    const once = bindCheck('{"version":1}', "diff --git a/a b/a\n+prisma");
    const twice = bindCheck('{"version":1}', "diff --git a/a b/a\n+prisma");
    expect(once).toEqual(twice);
    expect(once.policyDigest).toBe(sha256('{"version":1}'));
    expect(once.subject).toHaveLength(64);
  });

  test("a one-line diff change produces a new subject", () => {
    const before = bindCheck("policy", "+ const a = 1;\n");
    const after = bindCheck("policy", "+ const a = 2;\n");
    expect(after.diffDigest).not.toBe(before.diffDigest);
    expect(after.subject).not.toBe(before.subject);
    expect(after.policyDigest).toBe(before.policyDigest);
  });

  test("swapping the public key produces a new subject even when the diff is unchanged", () => {
    const before = bindCheck("policy", "+ ok", "public-key-a");
    const after = bindCheck("policy", "+ ok", "public-key-b");
    expect(after.keyDigest).not.toBe(before.keyDigest);
    expect(after.subject).not.toBe(before.subject);
    expect(after.diffDigest).toBe(before.diffDigest);
  });

  test("swapping the policy produces a new subject even when the diff is unchanged", () => {
    const before = bindCheck('{"version":1}', "+ ok");
    const after = bindCheck('{"version":1,"imports":[]}', "+ ok");
    expect(after.policyDigest).not.toBe(before.policyDigest);
    expect(after.subject).not.toBe(before.subject);
  });
});
