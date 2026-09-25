import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AUTH_AUDIT_SOURCE } from "../login/auth-audit-source.js";
import { patchLoginSource } from "../login/patch-login.js";

const SKIP = new Set(["node_modules", ".next", "dist", ".git", "coverage"]);
const MEMORY_MARK = "Every login try is written to server/.checkpoint/auth/ledger.jsonl";

function srcDirAbove(file: string): string {
  let dir = path.dirname(file);
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === "src") return dir;
    dir = path.dirname(dir);
  }
  return path.join(path.dirname(file), "..");
}

async function walk(dir: string, found: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return;
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, found);
    else if (entry.name === "login.service.js" || entry.name === "auth.service.js")
      found.push(full);
  }
}

async function ensureLedgerIgnore(projectRoot: string) {
  const line = "server/.checkpoint/auth/ledger.jsonl";
  const file = path.join(projectRoot, ".gitignore");
  let text = "";
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    text = "";
  }
  if (text.includes(line)) return;
  const next = text.length === 0 || text.endsWith("\n") ? `${text}${line}\n` : `${text}\n${line}\n`;
  await fs.writeFile(file, next);
}

async function ensureMemory(projectRoot: string) {
  const memoryDir = path.join(projectRoot, ".checkpoint", "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  try {
    const files = await fs.readdir(memoryDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(memoryDir, file), "utf8");
      if (raw.includes(MEMORY_MARK)) return;
    }
  } catch {
    // Directory was just created.
  }

  const memory = {
    id: randomUUID(),
    type: "CONVENTION",
    content: `Login path is POST /auth/login with phone_number or username, plus password. The screen shows one message when the login is wrong. ${MEMORY_MARK}. The record stores time, success or failure, reason, and who. It never stores the password.`,
    confidence: "CONFIRMED",
    provenance: "checkpoint login",
    scopedTo: ["server/src/Services/auth", "server/src/Utils/authAudit.js"],
  };
  await fs.writeFile(path.join(memoryDir, `${memory.id}.json`), JSON.stringify(memory, null, 2));
}

export async function loginCommand(rootArg?: string) {
  const root = path.resolve(rootArg || process.cwd());
  const files: string[] = [];
  await walk(root, files);

  const patched: string[] = [];
  const projects = new Set<string>();

  for (const file of files) {
    const original = await fs.readFile(file, "utf8");
    if (file.endsWith("auth.service.js") && !original.includes("login:")) continue;

    const serverSrc = srcDirAbove(file);
    const utilsDir = path.join(serverSrc, "Utils");
    const auditFile = path.join(utilsDir, "authAudit.js");
    // login.service.js lives in Services/auth, so Utils is ../../Utils.
    // auth.service.js lives in Services, so Utils is ../Utils.
    // path.relative handles both.
    const importSpec = path.relative(path.dirname(file), auditFile).replaceAll("\\", "/");
    const spec = importSpec.startsWith(".") ? importSpec : `./${importSpec}`;

    const next = patchLoginSource(original, spec);
    if (next === original && original.includes("await recordAuthEvent(")) {
      await fs.mkdir(utilsDir, { recursive: true });
      await fs.writeFile(auditFile, AUTH_AUDIT_SOURCE);
      patched.push(`${path.relative(root, file)} already records login`);
    } else if (next === original) {
      continue;
    } else {
      await fs.mkdir(utilsDir, { recursive: true });
      await fs.writeFile(auditFile, AUTH_AUDIT_SOURCE);
      await fs.writeFile(file, next);
      patched.push(path.relative(root, file));
    }

    const serverDir = path.resolve(serverSrc, "..");
    const projectRoot = path.basename(serverDir) === "server" ? path.dirname(serverDir) : serverDir;
    projects.add(projectRoot);
  }

  for (const projectRoot of projects) {
    await ensureMemory(projectRoot);
    await ensureLedgerIgnore(projectRoot);
  }

  console.log("LOGIN PATH\n");
  console.log("POST /auth/login");
  console.log("Body: phone_number or username, and password");
  console.log("Wrong user and wrong password show the same message.\n");

  if (patched.length === 0) {
    console.log("No login service was found in this folder.");
    console.log("Open a project that already has server login, then run: checkpoint login");
    return;
  }

  console.log("Accountability added:");
  for (const file of patched) console.log(`- ${file}`);
  console.log("\nEach try is saved in server/.checkpoint/auth/ledger.jsonl");
  console.log("Saved: time, success or failure, reason, who.");
  console.log("Not saved: password.");
}
