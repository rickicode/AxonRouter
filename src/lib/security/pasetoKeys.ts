import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/dataDir";

const GENERATED_PASETO_KEYS = "__AXONROUTER_GENERATED_PASETO_KEYS__";
const PASETO_PRIVATE_KEY_ENV = "PASETO_PRIVATE_KEY_B64";
const PASETO_PUBLIC_KEY_ENV = "PASETO_PUBLIC_KEY_B64";

type PasetoKeyPair = {
  privateKeyPem: string;
  publicKeyPem: string;
};

type GlobalWithPasetoKeyCache = typeof globalThis & {
  [GENERATED_PASETO_KEYS]?: PasetoKeyPair;
};

function getCachedKeys() {
  return (globalThis as GlobalWithPasetoKeyCache)[GENERATED_PASETO_KEYS];
}

function setCachedKeys(keys: PasetoKeyPair) {
  (globalThis as GlobalWithPasetoKeyCache)[GENERATED_PASETO_KEYS] = keys;
}

function getEnvFilePath(): string {
  return path.join(getDataDir(), ".env");
}

function parseEnvValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

function decodeKeyPair(privateB64: string, publicB64: string): PasetoKeyPair {
  return {
    privateKeyPem: Buffer.from(privateB64, "base64").toString("utf8"),
    publicKeyPem: Buffer.from(publicB64, "base64").toString("utf8"),
  };
}

function encodePrivateKey(keys: PasetoKeyPair) {
  return Buffer.from(keys.privateKeyPem, "utf8").toString("base64");
}

function encodePublicKey(keys: PasetoKeyPair) {
  return Buffer.from(keys.publicKeyPem, "utf8").toString("base64");
}

function loadFromEnvFile(): PasetoKeyPair | null {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return null;

  const content = fs.readFileSync(envPath, "utf8");
  const privateB64 = parseEnvValue(content, PASETO_PRIVATE_KEY_ENV);
  const publicB64 = parseEnvValue(content, PASETO_PUBLIC_KEY_ENV);
  if (!privateB64 || !publicB64) return null;

  return decodeKeyPair(privateB64, publicB64);
}

function persistToEnvFile(keys: PasetoKeyPair): void {
  const envPath = getEnvFilePath();
  const lines = [
    `${PASETO_PRIVATE_KEY_ENV}=${encodePrivateKey(keys)}`,
    `${PASETO_PUBLIC_KEY_ENV}=${encodePublicKey(keys)}`,
  ];

  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    if (new RegExp(`^${PASETO_PRIVATE_KEY_ENV}=`, "m").test(content) && new RegExp(`^${PASETO_PUBLIC_KEY_ENV}=`, "m").test(content)) {
      return;
    }
    fs.appendFileSync(envPath, `\n${lines.join("\n")}\n`);
    return;
  }

  fs.writeFileSync(envPath, `${lines.join("\n")}\n`);
}

function generatePasetoKeyPair(): PasetoKeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function assertUsableKeyPair(keys: PasetoKeyPair): PasetoKeyPair {
  crypto.createPrivateKey(keys.privateKeyPem);
  crypto.createPublicKey(keys.publicKeyPem);
  return keys;
}

function cacheAndExposeKeys(keys: PasetoKeyPair): PasetoKeyPair {
  const usableKeys = assertUsableKeyPair(keys);
  setCachedKeys(usableKeys);
  process.env[PASETO_PRIVATE_KEY_ENV] = encodePrivateKey(usableKeys);
  process.env[PASETO_PUBLIC_KEY_ENV] = encodePublicKey(usableKeys);
  return usableKeys;
}

function getPasetoKeys(): PasetoKeyPair {
  const privateFromEnv = process.env[PASETO_PRIVATE_KEY_ENV]?.trim();
  const publicFromEnv = process.env[PASETO_PUBLIC_KEY_ENV]?.trim();
  if (privateFromEnv && publicFromEnv) {
    return cacheAndExposeKeys(decodeKeyPair(privateFromEnv, publicFromEnv));
  }

  const cached = getCachedKeys();
  if (cached) return cached;

  const fromFile = loadFromEnvFile();
  if (fromFile) return cacheAndExposeKeys(fromFile);

  const generated = generatePasetoKeyPair();
  persistToEnvFile(generated);

  const persisted = loadFromEnvFile();
  if (!persisted) {
    throw new Error(`Unable to persist AxonRouter management session keys at ${getEnvFilePath()}`);
  }

  return cacheAndExposeKeys(persisted);
}

export function getPasetoPrivateKey() {
  return crypto.createPrivateKey(getPasetoKeys().privateKeyPem);
}

export function getPasetoPublicKey() {
  return crypto.createPublicKey(getPasetoKeys().publicKeyPem);
}
