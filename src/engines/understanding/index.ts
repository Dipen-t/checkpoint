import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface ProjectContext {
  runtime: string | null;
  language: string | null;
  packageManager: string | null;
  frameworks: string[];
  architecturalPatterns: string[];
  buildTooling: string[];
  testingSetup: string[];
  entrypoints: string[];
  codeConsistency: string[];
}

export interface IUnderstandingEngine {
  scanWorkspace(workspaceRoot: string): Promise<ProjectContext>;
}

export class UnderstandingEngine implements IUnderstandingEngine {
  async scanWorkspace(workspaceRoot: string): Promise<ProjectContext> {
    const context: ProjectContext = {
      runtime: null,
      language: null,
      packageManager: null,
      frameworks: [],
      architecturalPatterns: [],
      buildTooling: [],
      testingSetup: [],
      entrypoints: [],
      codeConsistency: [],
    };

    const hasFile = async (name: string) => {
      try {
        await fs.access(path.join(workspaceRoot, name));
        return true;
      } catch {
        return false;
      }
    };

    // 1. Package Manager
    if (await hasFile("package-lock.json")) context.packageManager = "npm";
    else if (await hasFile("pnpm-lock.yaml")) context.packageManager = "pnpm";
    else if (await hasFile("yarn.lock")) context.packageManager = "yarn";

    // 2. Language
    if (await hasFile("tsconfig.json")) context.language = "TypeScript";

    // 3. Package JSON Analysis
    let pkg: any = null;
    try {
      const pkgStr = await fs.readFile(path.join(workspaceRoot, "package.json"), "utf-8");
      pkg = JSON.parse(pkgStr);
    } catch {
      // no package.json
    }

    if (pkg) {
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      const allDeps = [...deps, ...devDeps];

      // Runtime
      if (
        allDeps.includes("@types/node") ||
        (pkg.scripts &&
          Object.values(pkg.scripts).some((s: any) => typeof s === "string" && s.includes("node ")))
      ) {
        context.runtime = "Node.js";
      }

      // Frameworks
      if (allDeps.includes("next")) context.frameworks.push("Next.js");
      if (allDeps.includes("express")) context.frameworks.push("Express");
      if (allDeps.includes("react")) context.frameworks.push("React");

      // Testing Setup
      if (allDeps.includes("vitest")) context.testingSetup.push("vitest");
      if (allDeps.includes("jest")) context.testingSetup.push("jest");
      if (allDeps.includes("mocha")) context.testingSetup.push("mocha");

      // Build Tooling
      if (allDeps.includes("tsup")) context.buildTooling.push("tsup");
      if (allDeps.includes("vite")) context.buildTooling.push("vite");
      if (allDeps.includes("webpack")) context.buildTooling.push("webpack");
      if (allDeps.includes("rollup")) context.buildTooling.push("rollup");
      if (allDeps.includes("esbuild")) context.buildTooling.push("esbuild");

      // Entrypoints
      if (pkg.bin) {
        if (typeof pkg.bin === "string") {
          context.entrypoints.push(pkg.bin);
        } else {
          for (const [cmd, file] of Object.entries(pkg.bin)) {
            context.entrypoints.push(`${cmd} -> ${file as string}`);
          }
        }
      }
      if (pkg.main) {
        context.entrypoints.push(`main -> ${pkg.main}`);
      }
    }

    // 4. Directory Structure / Architecture Analysis
    try {
      const rootEntries = await fs.readdir(workspaceRoot, { withFileTypes: true });
      const rootDirs = rootEntries.filter((e) => e.isDirectory()).map((e) => e.name);

      let srcDirs: string[] = [];
      try {
        const srcEntries = await fs.readdir(path.join(workspaceRoot, "src"), {
          withFileTypes: true,
        });
        srcDirs = srcEntries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {}

      const allDirs = Array.from(new Set([...rootDirs, ...srcDirs]));

      if (allDirs.includes("adapters") && allDirs.includes("engines") && allDirs.includes("core")) {
        context.architecturalPatterns.push("Modular Engine/Adapter Architecture");
      }
      if (allDirs.includes("controllers") && allDirs.includes("services")) {
        context.architecturalPatterns.push("Layered Controller-Service Architecture");
      }
      if (allDirs.includes("app") || allDirs.includes("pages")) {
        if (context.frameworks.includes("Next.js")) {
          context.architecturalPatterns.push("Next.js App-Router/Pages Architecture");
        } else {
          context.architecturalPatterns.push("App/Pages Architecture");
        }
      }
    } catch {
      // ignore
    }

    // 5. Code Consistency Analysis
    try {
      const sampleFiles = [
        "src/index.ts",
        "src/cli.ts",
        "src/app.ts",
        "src/main.ts",
        "src/index.js",
      ];
      for (const file of sampleFiles) {
        try {
          const content = await fs.readFile(path.join(workspaceRoot, file), "utf-8");
          // Semicolons
          if (content.includes(";\n")) {
            context.codeConsistency.push("Uses semicolons.");
          } else if (content.includes("\n") && !content.includes(";\n")) {
            context.codeConsistency.push("Does not use semicolons.");
          }
          // Quotes
          const singleQuotes = (content.match(/'/g) || []).length;
          const doubleQuotes = (content.match(/"/g) || []).length;
          if (doubleQuotes > singleQuotes + 10)
            context.codeConsistency.push("Prefers double quotes for strings.");
          else if (singleQuotes > doubleQuotes + 10)
            context.codeConsistency.push("Prefers single quotes for strings.");

          break; // Just need one good sample
        } catch {}
      }
    } catch {}

    return context;
  }
}
