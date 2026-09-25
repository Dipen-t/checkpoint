/** Shared login ledger. Passwords, tokens, and secrets are dropped before write. */
export const AUTH_AUDIT_SOURCE = `import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ledgerPath = path.resolve(here, "../../.checkpoint/auth/ledger.jsonl");

const SECRET = /password|token|secret|authorization|cookie/i;

export function toAuthAuditRecord(event) {
  const record = { at: new Date().toISOString() };
  if (!event || typeof event !== "object") return record;
  for (const [key, value] of Object.entries(event)) {
    if (SECRET.test(key)) continue;
    if (typeof value === "string") record[key] = value.slice(0, 160);
    else if (value == null || typeof value === "number" || typeof value === "boolean") record[key] = value;
  }
  return record;
}

export async function recordAuthEvent(event) {
  const record = toAuthAuditRecord(event);
  try {
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await appendFile(ledgerPath, JSON.stringify(record) + "\\n", "utf8");
  } catch (err) {
    console.error("[AUTH AUDIT] Could not write the login ledger.", err);
  }
}
`;
