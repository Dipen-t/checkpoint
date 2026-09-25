import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { AUTH_AUDIT_SOURCE } from "../src/login/auth-audit-source.js";
import { patchLoginSource } from "../src/login/patch-login.js";

const loginService = `import { Logger } from "../../Utils/logger.js";

export const loginService = async (phone_number, password) => {
  const normalized = String(phone_number || "").trim();
  const user = await findUser(normalized);

  if (!user) {
    Logger.dbLog({ module: "AUTH", action: "LOGIN_FAILED", description: "missing" });
    throw { statusCode: 401, message: "Wrong phone number or password." };
  }

  const decryptedDbPassword = CryptoUtils.decrypt(user.user_password);
  if (decryptedDbPassword !== password) {
    Logger.dbLog({ module: "AUTH", action: "LOGIN_FAILED", description: "bad" });
    throw { statusCode: 401, message: "Wrong phone number or password." };
  }

  if (user.user_status !== "ACTIVE") {
    throw { statusCode: 403, message: "Your account is turned off. Ask for help." };
  }

  Logger.dbLog({ module: "AUTH", action: "LOGIN_SUCCESS", description: "ok" });
  return { user, tokens: {} };
};
`;

const authService = `import { Logger } from "../Utils/logger.js";

export const AuthService = {
  login: async (username, password) => {
    const normalizedUsername = String(username || "").trim();
    const user = await findUser(normalizedUsername);
    if (!user) {
      throw { statusCode: 401, message: "Invalid username or password" };
    }
    const decryptedDbPassword = CryptoUtils.decrypt(user.user_password);
    if (decryptedDbPassword !== password) {
      throw { statusCode: 401, message: "Invalid username or password" };
    }
    if (user.user_status !== "ACTIVE") {
      throw { statusCode: 403, message: "Your account is disabled. Please contact support." };
    }
    return { user, tokens: {} };
  },

  validateToken: (token) => {
    throw { statusCode: 401, message: "Your session has expired. Please log in again." };
  },
};
`;

describe("login accountability patch", () => {
  test("records unknown user, bad password, disabled account, and success", () => {
    const next = patchLoginSource(loginService, "../../Utils/authAudit.js");
    expect(next).toContain('import { recordAuthEvent } from "../../Utils/authAudit.js";');
    expect(next).toContain('reason: "unknown_user"');
    expect(next).toContain('reason: "bad_password"');
    expect(next).toContain('reason: "disabled"');
    expect(next).toContain('action: "LOGIN_SUCCESS"');
    expect(next).toContain("identifier: normalized");
    expect(next.match(/recordAuthEvent/g)?.length).toBe(5);
  });

  test("leaves token checks outside the login function alone", () => {
    const next = patchLoginSource(authService, "../Utils/authAudit.js");
    const tokenPart = next.slice(next.indexOf("validateToken"));
    expect(tokenPart).not.toContain("recordAuthEvent");
    expect(next).toContain('reason: "unknown_user"');
    expect(next).toContain('reason: "bad_password"');
    expect(next).toContain('reason: "disabled"');
  });

  test("a function with a destructured argument is still covered", () => {
    const source = `export const loginService = async (
  phone_number,
  password,
  host = null,
  { portal = "admin" } = {},
) => {
  const normalized = String(phone_number || "").trim();
  const user = await findUser(normalized);
  if (!user) {
    throw { statusCode: 401, message: "Wrong phone, email, or password." };
  }
  if (portalKind === "customer") {
    throw {
      statusCode: 403,
      message: "Please use the staff app to sign in.",
    };
  }
  return result;
};
`;
    const next = patchLoginSource(source, "../../Utils/authAudit.js");
    expect(next).toContain('reason: "unknown_user"');
    expect(next).toContain('reason: "wrong_portal"');
    expect(next).toContain('action: "LOGIN_SUCCESS"');
  });

  test("a second run does not add the calls again", () => {
    const once = patchLoginSource(loginService, "../../Utils/authAudit.js");
    const twice = patchLoginSource(once, "../../Utils/authAudit.js");
    expect(twice).toBe(once);
  });

  test("ledger record drops passwords", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auth-audit-"));
    const file = path.join(dir, "server", "src", "Utils", "authAudit.js");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, AUTH_AUDIT_SOURCE);
    const mod = await import(pathToFileURL(file).href);
    const record = mod.toAuthAuditRecord({
      action: "LOGIN_FAILED",
      identifier: "99999",
      password: "secret-value",
      access_token: "abc",
    });
    expect(record.password).toBeUndefined();
    expect(record.access_token).toBeUndefined();
    expect(record.identifier).toBe("99999");
    await mod.recordAuthEvent({ action: "LOGIN_SUCCESS", reason: "ok", identifier: "99999" });
    const ledger = await readFile(path.join(dir, "server", ".checkpoint", "auth", "ledger.jsonl"), "utf8");
    expect(ledger).toContain("LOGIN_SUCCESS");
    expect(ledger).not.toContain("secret-value");
    await rm(dir, { recursive: true, force: true });
  });
});
