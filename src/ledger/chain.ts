import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { keyIdOf, readPrivateKey, readPublicKey, signatureMatches, signHash } from "./sign.js";

/** SHA-256 of an empty predecessor. Microsoft Agent Governance Toolkit ADR-0017 uses the same chain shape. */
export const GENESIS_HASH = "0".repeat(64);

const SECRET_KEY = /password|token|secret|authorization|cookie|api[_-]?key/i;
const SECRET_ASSIGNMENT = /(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi;

export type LedgerSource = "AGENT" | "SYSTEM" | "HUMAN";

export type LedgerEvent = {
  seq: number;
  at: string;
  type: string;
  source: LedgerSource;
  payload: Record<string, unknown>;
  prevHash: string;
  keyId?: string;
  hash: string;
  signature?: string;
};

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = redact(nested);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.replace(SECRET_ASSIGNMENT, "$1=[redacted]").slice(0, 2000);
  }
  return value;
}

export function canonicalEvent(event: Omit<LedgerEvent, "hash" | "signature">): string {
  return JSON.stringify({
    seq: event.seq,
    at: event.at,
    type: event.type,
    source: event.source,
    payload: event.payload,
    prevHash: event.prevHash,
    ...(event.keyId ? { keyId: event.keyId } : {}),
  });
}

export function hashEvent(event: Omit<LedgerEvent, "hash">): string {
  return createHash("sha256").update(canonicalEvent(event)).digest("hex");
}

/** A rewritten chain still fails when the signature was not made by checkpoint.pub. */
export function verifySignatures(
  events: LedgerEvent[],
  publicPem: string,
): { ok: boolean; brokenAt?: number } {
  const keyId = keyIdOf(publicPem);
  for (const event of events) {
    if (!event.signature || event.keyId !== keyId) return { ok: false, brokenAt: event.seq };
    if (!signatureMatches(publicPem, event.hash, event.signature)) {
      return { ok: false, brokenAt: event.seq };
    }
  }
  return { ok: true };
}

export function verifyChain(events: LedgerEvent[]): { ok: boolean; brokenAt?: number } {
  let prev = GENESIS_HASH;
  for (const event of events) {
    if (event.prevHash !== prev) return { ok: false, brokenAt: event.seq };
    const { hash, ...rest } = event;
    if (hashEvent(rest) !== hash) return { ok: false, brokenAt: event.seq };
    prev = hash;
  }
  return { ok: true };
}

export class Ledger {
  private queue: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.filePath = path.join(workspaceRoot, ".checkpoint", "ledger.jsonl");
  }

  async append(input: {
    type: string;
    source: LedgerSource;
    payload?: Record<string, unknown>;
    at?: string;
  }): Promise<LedgerEvent> {
    const run = this.queue.then(() => this.appendNow(input));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async read(): Promise<LedgerEvent[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as LedgerEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async verify(): Promise<{ ok: boolean; brokenAt?: number; count: number }> {
    const events = await this.read();
    const result = verifyChain(events);
    return { ...result, count: events.length };
  }

  private async appendNow(input: {
    type: string;
    source: LedgerSource;
    payload?: Record<string, unknown>;
    at?: string;
  }): Promise<LedgerEvent> {
    const existing = await this.read();
    const prev = existing[existing.length - 1];
    const privatePem = await readPrivateKey(this.workspaceRoot);
    const publicPem = await readPublicKey(this.workspaceRoot);
    const paired =
      privatePem &&
      publicPem &&
      signatureMatches(publicPem, "checkpoint", signHash(privatePem, "checkpoint"))
        ? { privatePem, publicPem }
        : null;
    const draft: Omit<LedgerEvent, "hash" | "signature"> = {
      seq: existing.length + 1,
      at: input.at ?? new Date().toISOString(),
      type: input.type,
      source: input.source,
      payload: redact(input.payload ?? {}) as Record<string, unknown>,
      prevHash: prev?.hash ?? GENESIS_HASH,
      ...(paired ? { keyId: keyIdOf(paired.publicPem) } : {}),
    };
    const hash = hashEvent(draft);
    const event: LedgerEvent = paired
      ? { ...draft, hash, signature: signHash(paired.privatePem, hash) }
      : { ...draft, hash };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }
}
