const ID_NAMES = ["normalizedUsername", "loginId", "normalized", "phone_number", "username"];

export function loginSlice(source: string): { start: number; end: number } | null {
  const markers = ["export const loginService = async", "login: async ("];
  let start = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    if (index !== -1 && (start === -1 || index < start)) start = index;
  }
  if (start === -1) return null;

  const arrow = source.indexOf("=>", start);
  const brace = source.indexOf("{", arrow === -1 ? start : arrow);
  if (brace === -1) return null;

  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

function identifierName(slice: string): string {
  for (const name of ID_NAMES) {
    if (new RegExp(`\\b${name}\\b`).test(slice)) return name;
  }
  return "undefined";
}

function reasonForThrow(statement: string, code: string, before: string): string {
  if (code === "403") {
    if (/disabled|turned off|not active/i.test(statement)) return "disabled";
    if (/staff app|customer website|portal/i.test(statement)) return "wrong_portal";
    return "forbidden";
  }

  const window = before.slice(-1200);
  const signals: Array<[string, number]> = [
    ["bad_password", Math.max(window.lastIndexOf("decrypt"), window.lastIndexOf("!== password"))],
    [
      "missing_credentials",
      Math.max(window.lastIndexOf("!password"), window.lastIndexOf("!loginId")),
    ],
    ["unknown_user", window.lastIndexOf("!user")],
  ];
  signals.sort((a, b) => b[1] - a[1]);
  if (signals[0][1] >= 0) return signals[0][0];
  return "rejected";
}

function auditCall(indent: string, action: string, reason: string, idExpr: string): string {
  return `${indent}await recordAuthEvent({ action: "${action}", reason: "${reason}", identifier: ${idExpr}, userId: typeof user !== "undefined" && user ? user.user_id : null, userRole: typeof user !== "undefined" && user ? user.user_role : null });`;
}

function addImport(source: string, spec: string): string {
  const line = `import { recordAuthEvent } from "${spec}";`;
  if (source.includes(line)) return source;
  const imports = [...source.matchAll(/^import .*;$/gm)];
  if (imports.length === 0) return `${line}\n${source}`;
  const last = imports[imports.length - 1];
  const at = (last.index ?? 0) + last[0].length;
  return `${source.slice(0, at)}\n${line}${source.slice(at)}`;
}

/**
 * Records every login outcome inside the login function only.
 * A second run leaves the file unchanged.
 */
export function patchLoginSource(source: string, importSpec: string): string {
  if (source.includes("await recordAuthEvent(")) return source;
  const slice = loginSlice(source);
  if (!slice) return source;

  const idExpr = identifierName(source.slice(slice.start, slice.end));
  let body = source.slice(slice.start, slice.end);
  const hasLogger = source.includes("Logger");

  body = body.replace(
    /^([ \t]*)throw\s*\{[\s\S]*?statusCode:\s*(401|403)\b[\s\S]*?\};/gm,
    (statement, indent: string, code: string, offset: number) => {
      const before = body.slice(0, offset);
      const reason = reasonForThrow(statement, code, before);
      const lines = [auditCall(indent, "LOGIN_FAILED", reason, idExpr)];
      if (code === "403" && hasLogger) {
        lines.push(
          `${indent}Logger.dbLog({ module: "AUTH", action: "LOGIN_FAILED", description: \`Login blocked (${reason}) for \${${idExpr}}\`, userId: typeof user !== "undefined" && user ? user.user_id : "SYSTEM", userType: typeof user !== "undefined" && user ? user.user_role : "SYSTEM" });`,
        );
      }
      return `${lines.join("\n")}\n${statement}`;
    },
  );

  const returns = [...body.matchAll(/^[ \t]*return\b/gm)];
  const lastReturn = returns[returns.length - 1];
  if (lastReturn && lastReturn.index !== undefined) {
    const indent = lastReturn[0].match(/^[ \t]*/)?.[0] ?? "";
    const call = `${auditCall(indent, "LOGIN_SUCCESS", "ok", idExpr)}\n`;
    body = `${body.slice(0, lastReturn.index)}${call}${body.slice(lastReturn.index)}`;
  }

  const next = `${source.slice(0, slice.start)}${body}${source.slice(slice.end)}`;
  return addImport(next, importSpec);
}
