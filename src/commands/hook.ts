import { handleAntigravityHook } from "../adapters/antigravity/index.js";

export async function hookCommand(hookType: string) {
  let rawData = "";
  process.stdin.setEncoding("utf-8");

  for await (const chunk of process.stdin) {
    rawData += chunk;
  }

  try {
    const payload = rawData ? JSON.parse(rawData) : {};
    const result = await handleAntigravityHook(hookType, payload);
    // AGY hooks must output valid JSON on stdout
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (err: any) {
    // Failsafe: Do not block the agent if Checkpoint crashes
    process.stdout.write(JSON.stringify({}) + "\n");
  }
}
