import type { Deviation } from "../../models/verification.js";
import { evaluatePolicy } from "../../policy/evaluate.js";
import { HOUSE_POLICY } from "../../policy/schema.js";

export type DiffHunk = {
  file: string;
  addedLines: string[];
};

const SCHEMA_FILE = /(?:^|\/)(prisma\/schema\.prisma|migrations\/.*|[^/]+\.sql)$/i;
const FRAMEWORK_DEP = /"(next|react|vue|express|fastify|prisma|mongoose)"\s*:/;

/**
 * Split a git diff into added lines per file.
 * Lines are evidence. The agent's plan is not used here.
 */
export function parseDiffHunks(gitDiffs: string[], modifiedFiles: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let sawHeader = false;

  for (const diff of gitDiffs) {
    for (const line of diff.split("\n")) {
      const header = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
      if (header && header[1] !== "/dev/null") {
        sawHeader = true;
        current = { file: header[1].trim(), addedLines: [] };
        hunks.push(current);
        continue;
      }
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      const added = line.slice(1);
      if (current) current.addedLines.push(added);
    }
  }

  if (sawHeader) return hunks.filter((hunk) => hunk.addedLines.length > 0);

  const addedLines = gitDiffs
    .flatMap((diff) => diff.split("\n"))
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  if (addedLines.length === 0) return [];
  return modifiedFiles.map((file) => ({ file, addedLines }));
}

export function boundaryDeviations(hunks: DiffHunk[]): Deviation[] {
  const deviations: Deviation[] = [];

  for (const hunk of hunks) {
    const file = hunk.file.replaceAll("\\", "/");

    if (SCHEMA_FILE.test(file)) {
      deviations.push({
        type: "ARCHITECTURE",
        severity: "CRITICAL",
        description: `${file} changes the data model. That needs a human decision.`,
      });
    }

    if (file.endsWith("package.json")) {
      const framework = hunk.addedLines.find((line) => FRAMEWORK_DEP.test(line));
      if (framework) {
        deviations.push({
          type: "ARCHITECTURE",
          severity: "MAJOR",
          description: `package.json adds a core dependency (${framework.trim()}). That needs a human decision.`,
        });
      }
    }
  }

  for (const finding of evaluatePolicy(HOUSE_POLICY, hunks)) {
    if (finding.verdict === "warn") continue;
    deviations.push({
      type: "ARCHITECTURE",
      severity: finding.verdict === "block" ? "CRITICAL" : "MAJOR",
      description: `${finding.file}: ${finding.message}`,
    });
  }

  return deviations;
}
