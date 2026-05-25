import crypto from "crypto";

type PlainObject = Record<string, unknown>;
type TokenMetadata = Record<string, string | number | boolean>;
type TokenMetadataValue = string | number | boolean;
type SyncTokenRecord = {
  id?: string;
  name?: string;
  metadata?: unknown;
  tokenHash?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string | null;
  [key: string]: unknown;
};

function isPlainObject(value: unknown): value is PlainObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isTokenMetadataValue(value: unknown): value is TokenMetadataValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function normalizeMetadata(value: unknown): TokenMetadata {
  if (!isPlainObject(value)) return {};

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<TokenMetadata>((result, key) => {
      const nextValue = value[key];
      if (nextValue == null) return result;
      if (isTokenMetadataValue(nextValue)) {
        result[key] = nextValue;
      }
      return result;
    }, {});
}

export function hashSyncToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSyncToken({ name, metadata }: { name?: unknown; metadata?: unknown } = {}) {
  const normalizedName = normalizeString(name);
  if (!normalizedName) {
    throw new Error("Token name is required");
  }

  const now = new Date().toISOString();
  const rawToken = `ocs_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = hashSyncToken(rawToken);

  return {
    token: rawToken,
    record: {
      id: crypto.randomUUID(),
      name: normalizedName,
      metadata: normalizeMetadata(metadata),
      tokenHash,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
    },
  };
}

export function verifySyncToken(token: unknown, record: SyncTokenRecord | null | undefined) {
  const normalizedToken = normalizeString(token);
  const tokenHash = normalizeString(record?.tokenHash);
  if (!normalizedToken || !tokenHash) {
    return false;
  }

  const expected = Buffer.from(tokenHash, "hex");
  const actual = Buffer.from(hashSyncToken(normalizedToken), "hex");

  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function extractBearerToken(authorizationHeader: unknown) {
  const value = normalizeString(authorizationHeader);
  if (!value) return "";

  const match = /^Bearer\s+(.+)$/iu.exec(value);
  return match ? normalizeString(match[1]) : "";
}

export function findMatchingSyncTokenRecord(records: unknown, authorizationHeader: unknown) {
  const token = extractBearerToken(authorizationHeader);
  if (!token || !Array.isArray(records)) {
    return null;
  }

  return records.find((record) => verifySyncToken(token, record)) || null;
}

export function toPublicTokenRecord(record: unknown) {
  if (!isPlainObject(record)) return null;

  const publicRecord = {
    id: record.id,
    name: record.name,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt || null,
  };
  return {
    ...publicRecord,
    metadata: normalizeMetadata(publicRecord.metadata),
  };
}

export function touchSyncTokenRecord(record: SyncTokenRecord | null | undefined, usedAt = new Date().toISOString()) {
  if (!isPlainObject(record)) {
    throw new Error("Invalid token record");
  }

  return {
    ...record,
    lastUsedAt: usedAt,
    updatedAt: usedAt,
  };
}

export function normalizeSyncTokenPatch(input: unknown) {
  if (!isPlainObject(input)) {
    throw new Error("Invalid token payload");
  }

  const updates: Record<string, unknown> = {};

  if (Object.hasOwn(input, "name")) {
    const name = normalizeString(input.name);
    if (!name) throw new Error("Token name is required");
    updates.name = name;
  }

  if (Object.hasOwn(input, "metadata")) {
    if (!isPlainObject(input.metadata)) {
      throw new Error("Invalid token metadata");
    }
    updates.metadata = normalizeMetadata(input.metadata);
  }

  return updates;
}
