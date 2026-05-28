import { access, constants, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";

type StoredCredentials = {
  default?: {
    id?: string;
    name?: string;
    email?: string;
    authToken?: string;
    fingerprintId?: string;
    fingerprintHash?: string;
  };
};

type InstanceOwner = {
  instanceId?: string;
  pid?: number;
};

const MANICODE_DIR = join(homedir(), ".config", "manicode");
const CREDENTIALS_PATH = join(MANICODE_DIR, "credentials.json");
const INSTANCE_OWNER_PATH = join(MANICODE_DIR, "freebuff-instance-owner.json");

export async function GET() {
  try {
    await access(CREDENTIALS_PATH, constants.R_OK);
  } catch {
    return NextResponse.json({
      found: false,
      error: "Freebuff credentials not found at ~/.config/manicode/credentials.json",
    });
  }

  try {
    const [raw, credentialsStats] = await Promise.all([
      readFile(CREDENTIALS_PATH, "utf8"),
      stat(CREDENTIALS_PATH),
    ]);
    const parsed = JSON.parse(raw) as StoredCredentials;
    const account = parsed?.default;

    if (!account?.authToken || typeof account.authToken !== "string") {
      return NextResponse.json({
        found: false,
        error: "Freebuff auth token is missing in credentials.json",
      });
    }

    let instanceId: string | undefined;
    let instanceOwnerMtimeMs: number | null = null;
    try {
      await access(INSTANCE_OWNER_PATH, constants.R_OK);
      const [ownerRaw, ownerStats] = await Promise.all([
        readFile(INSTANCE_OWNER_PATH, "utf8"),
        stat(INSTANCE_OWNER_PATH),
      ]);
      const ownerParsed = JSON.parse(ownerRaw) as InstanceOwner;
      if (typeof ownerParsed?.instanceId === "string" && ownerParsed.instanceId.trim()) {
        instanceId = ownerParsed.instanceId.trim();
      }
      instanceOwnerMtimeMs = ownerStats.mtimeMs;
    } catch {
      instanceId = undefined;
    }

    return NextResponse.json({
      found: true,
      authToken: account.authToken,
      name: account.name || account.email || "Freebuff Account",
      email: account.email || null,
      accountId: account.email || account.id || null,
      fingerprintId: account.fingerprintId || null,
      fingerprintHash: account.fingerprintHash || null,
      instanceId: instanceId || null,
      credentialsMtimeMs: credentialsStats.mtimeMs,
      instanceOwnerMtimeMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ found: false, error: message }, { status: 500 });
  }
}
