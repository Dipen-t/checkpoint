import { test, expect, vi, beforeEach } from "vitest";
import { doctorCommand } from "../src/commands/doctor.js";

let logOutput: string[] = [];
let exitCode: number | undefined;

beforeEach(() => {
  logOutput = [];
  vi.spyOn(console, "log").mockImplementation((...args: any[]) => {
    logOutput.push(args.join(" "));
  });
  
  vi.spyOn(process, "exit").mockImplementation((code: any) => {
    exitCode = code;
    return undefined as never;
  });
});

test("doctorCommand reports healthy in the main Checkpoint repo", async () => {
  // Since we are running in the main repo which is already initialized and is a git repo
  await doctorCommand();
  
  const output = logOutput.join("\n");
  
  expect(output).toContain("[PASS] .checkpoint/ directory exists");
  expect(output).toContain("[PASS] State file is readable");
  expect(output).toContain("[PASS] Memory directory is readable");
  expect(output).toContain("[PASS] Git is available and inside a repository");
  expect(output).toContain("[PASS] Project configuration (package.json) is readable");
  expect(output).toContain("✅ The environment is healthy and ready for Checkpoint.");
  
  expect(exitCode).toBe(0);
});
