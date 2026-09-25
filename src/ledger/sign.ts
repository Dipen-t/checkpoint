import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { sha256 } from "../policy/evidence.js";

/** Public key committed with the repo. Private key stays outside it, as Witness does. */
export function publicKeyPath(root: string): string {
  return path.join(root, "checkpoint.pub");
}

export function privateKeyPath(root: string): string {
  const base = process.env.CHECKPOINT_KEY_DIR || path.join(homedir(), ".checkpoint", "keys");
  const id = createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
  return path.join(base, `${id}.pem`);
}

export function keyIdOf(publicPem: string): string {
  return sha256(publicPem);
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function readPublicKey(root: string): Promise<string | null> {
  return readText(publicKeyPath(root));
}

export function readPrivateKey(root: string): Promise<string | null> {
  return readText(privateKeyPath(root));
}

export function signHash(privatePem: string, hash: string): string {
  return sign(null, Buffer.from(hash), createPrivateKey(privatePem)).toString("base64");
}

export function signatureMatches(publicPem: string, hash: string, signature: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(hash),
      createPublicKey(publicPem),
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

export async function ensureKeypair(root: string): Promise<{
  publicPem: string;
  privatePath: string;
  created: boolean;
}> {
  const pubPath = publicKeyPath(root);
  const privPath = privateKeyPath(root);
  const existingPub = await readPublicKey(root);
  const existingPriv = await readPrivateKey(root);

  if (existingPub && existingPriv) {
    if (!signatureMatches(existingPub, "checkpoint", signHash(existingPriv, "checkpoint"))) {
      throw new Error("checkpoint.pub does not match the private key outside the repo.");
    }
    return { publicPem: existingPub, privatePath: privPath, created: false };
  }

  if (existingPub && !existingPriv) {
    throw new Error(`checkpoint.pub is present, but the private key is missing at ${privPath}`);
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  await fs.mkdir(path.dirname(privPath), { recursive: true });
  await fs.writeFile(privPath, privatePem, { mode: 0o600 });
  await fs.chmod(privPath, 0o600);
  await fs.writeFile(pubPath, publicPem);
  return { publicPem, privatePath: privPath, created: true };
}
