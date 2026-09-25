import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { GENESIS_HASH, type LedgerEvent } from "./chain.js";

const execFileAsync = promisify(execFile);

export type Anchor = { seq: number; hash: string };

/** No committed record yet. A later signature may append. It may not replace this. */
export const GENESIS_ANCHOR: Anchor = { seq: 0, hash: GENESIS_HASH };

export function anchorText(anchor: Anchor): string {
  return `${JSON.stringify(anchor, null, 2)}\n`;
}

export function parseAnchor(raw: string): Anchor | null {
  try {
    const parsed = JSON.parse(raw) as { seq?: unknown; hash?: unknown };
    if (typeof parsed.seq !== "number" || !Number.isInteger(parsed.seq) || parsed.seq < 0)
      return null;
    if (typeof parsed.hash !== "string" || !/^[0-9a-f]{64}$/.test(parsed.hash)) return null;
    return { seq: parsed.seq, hash: parsed.hash };
  } catch {
    return null;
  }
}

/** The hash named by a committed anchor must still sit at that position. */
export function ledgerExtends(events: LedgerEvent[], anchor: Anchor): boolean {
  if (anchor.seq === 0) return anchor.hash === GENESIS_HASH;
  const event = events[anchor.seq - 1];
  return Boolean(event && event.seq === anchor.seq && event.hash === anchor.hash);
}

export async function readCommittedAnchor(
  root: string,
  rev: string,
): Promise<{ ok: true; anchor: Anchor } | { ok: false; reason: "missing" | "invalid" }> {
  try {
    const result = await execFileAsync("git", ["show", `${rev}:checkpoint.anchor`], { cwd: root });
    const anchor = parseAnchor(result.stdout);
    return anchor ? { ok: true, anchor } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "missing" };
  }
}

export async function upstreamRev(root: string): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["rev-parse", "--verify", "--quiet", "@{u}"], {
      cwd: root,
    });
    const rev = result.stdout.trim();
    return rev || null;
  } catch {
    return null;
  }
}

export async function anchorStatus(
  root: string,
  events: LedgerEvent[],
): Promise<{ ok: true } | { ok: false; reason: string; seq: number }> {
  const head = await readCommittedAnchor(root, "HEAD");
  if (!head.ok) {
    return {
      ok: false,
      reason: head.reason === "missing" ? "missing_anchor" : "invalid_anchor",
      seq: 0,
    };
  }
  if (!ledgerExtends(events, head.anchor)) {
    return { ok: false, reason: "anchor_mismatch", seq: head.anchor.seq };
  }

  const upstream = await upstreamRev(root);
  if (!upstream) return { ok: true };

  const remote = await readCommittedAnchor(root, upstream);
  if (!remote.ok) {
    return {
      ok: false,
      reason: remote.reason === "missing" ? "missing_remote_anchor" : "invalid_remote_anchor",
      seq: 0,
    };
  }
  if (!ledgerExtends(events, remote.anchor)) {
    return { ok: false, reason: "remote_anchor_mismatch", seq: remote.anchor.seq };
  }
  return { ok: true };
}

export async function publishAnchor(root: string, events: LedgerEvent[]): Promise<void> {
  const tip = events[events.length - 1];
  const anchor: Anchor = tip ? { seq: tip.seq, hash: tip.hash } : GENESIS_ANCHOR;
  await fs.writeFile(path.join(root, "checkpoint.anchor"), anchorText(anchor));
}
