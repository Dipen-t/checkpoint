import { test, expect, vi, beforeEach } from "vitest";
import { inspectCommand } from "../src/commands/inspect.js";
import * as path from "node:path";

let logOutput: string[] = [];
beforeEach(() => {
  logOutput = [];
  vi.spyOn(console, "log").mockImplementation((...args: any[]) => {
    logOutput.push(args.join(" "));
  });
});

test("Inspects Checkpoint (Modular CLI Architecture)", async () => {
  const checkpointRoot = process.cwd(); // We run vitest from root
  await inspectCommand(checkpointRoot);
  
  const output = logOutput.join("\n");
  
  // Deterministic checks based on actual Checkpoint repo evidence
  expect(output).toContain("Runtime:        Node.js"); // due to @types/node and scripts
  expect(output).toContain("Language:       TypeScript"); // due to tsconfig.json
  expect(output).toContain("Package Mgr:    npm"); // due to package-lock.json
  expect(output).toContain("Testing:        vitest"); // due to devDependencies
  expect(output).toContain("Build Tooling:  tsup"); // due to devDependencies
  expect(output).toContain("Architecture:   Modular Engine/Adapter Architecture"); // due to src/engines, src/adapters, src/core
  expect(output).toContain("checkpoint -> dist/cli.js");
});

test("Inspects Layered API Fixture (Layered Express Architecture)", async () => {
  const fixtureRoot = path.join(process.cwd(), "checkpoint-lab", "layered-node-api");
  await inspectCommand(fixtureRoot);
  
  const output = logOutput.join("\n");
  
  // Deterministic checks based on the fixture evidence
  // We added tsconfig, express, jest, package-lock to it
  expect(output).toContain("Language:       TypeScript");
  expect(output).toContain("Package Mgr:    npm");
  expect(output).toContain("Frameworks:     Express");
  expect(output).toContain("Testing:        jest");
  expect(output).toContain("Architecture:   Layered Controller-Service Architecture");
});
