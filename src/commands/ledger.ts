import { Ledger, verifySignatures } from "../ledger/chain.js";
import { readPublicKey } from "../ledger/sign.js";

export async function ledgerCommand() {
  const root = process.cwd();
  const ledger = new Ledger(root);
  const result = await ledger.verify();

  console.log("LEDGER\n");
  if (result.count === 0) {
    console.log("No ledger yet. Checkpoint writes one when a task moves or a plan is checked.");
    return;
  }

  console.log(`${result.count} records`);
  if (!result.ok) {
    console.log(`Chain: broken at record ${result.brokenAt}`);
    process.exitCode = 1;
    return;
  }

  const publicPem = await readPublicKey(root);
  if (!publicPem) {
    console.log("Chain: intact");
    console.log(
      "Signature: missing. Run checkpoint adopt and keep the private key outside the repo.",
    );
    process.exitCode = 1;
    return;
  }

  const signed = verifySignatures(await ledger.read(), publicPem);
  if (!signed.ok) {
    console.log("Chain: intact");
    console.log(`Signature: broken at record ${signed.brokenAt}`);
    console.log("A rewritten chain fails when it was not signed by checkpoint.pub.");
    process.exitCode = 1;
    return;
  }

  console.log("Chain: intact");
  console.log("Signature: matches checkpoint.pub");
}
