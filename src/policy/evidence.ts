import { createHash } from "node:crypto";

/** SHA-256 hex of the exact bytes. GitPin and agentledger bind a decision this way. */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * A check is credible only if it names the policy and the diff it judged.
 * subject changes when either one changes, so an old allow does not cover a new edit.
 */
export function bindCheck(
  policyRaw: string,
  diff: string,
  publicKey = "",
): {
  policyDigest: string;
  diffDigest: string;
  keyDigest: string;
  subject: string;
} {
  const policyDigest = sha256(policyRaw);
  const diffDigest = sha256(diff);
  const keyDigest = sha256(publicKey);
  const subject = sha256(`${policyDigest}\n${diffDigest}\n${keyDigest}`);
  return { policyDigest, diffDigest, keyDigest, subject };
}
