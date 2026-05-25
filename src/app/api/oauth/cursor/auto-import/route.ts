import { execFile } from "child_process";
import { access, constants } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { NextResponse } from "next/server";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const ACCESS_TOKEN_KEYS = ["cursorAuth/accessToken", "cursorAuth/token"] as const;
const MACHINE_ID_KEYS = [
  "storage.serviceMachineId",
  "storage.machineId",
  "telemetry.machineId",
] as const;

type SupportedPlatform = "darwin" | "linux" | "win32";
type TokenValue = string | null;
type DbRow = { key?: string; value?: unknown };

type TokenResult = {
  accessToken: TokenValue;
  machineId: TokenValue;
};

function getCandidatePaths(platform: SupportedPlatform): string[] {
  const home = homedir();

  if (platform === "darwin") {
    return [
      join(
        home,
        "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
      ),
      join(
        home,
        "Library/Application Support/Cursor - Insiders/User/globalStorage/state.vscdb",
      ),
    ];
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(
        appData,
        "Cursor - Insiders",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
      join(localAppData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(
        localAppData,
        "Programs",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
    ];
  }

  return [
    join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
    join(home, ".config/cursor/User/globalStorage/state.vscdb"),
  ];
}

const normalize = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
};

async function extractTokensViaBetterSqlite(dbPath: string): Promise<TokenResult> {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  const runQuery = (sql: string, params: string[] = []): DbRow[] => {
    const stmt = db.prepare(sql) as {
      all?: (...args: string[]) => DbRow[];
      get?: (...args: string[]) => DbRow | undefined;
    };
    if (typeof stmt.all === "function") return stmt.all(...params) || [];
    if (typeof stmt.get === "function") return [stmt.get(...params)].filter(Boolean);
    return [];
  };

  const queryValue = (exactKeys: readonly string[], fuzzyPatterns: readonly string[]): unknown => {
    const exactPlaceholders = exactKeys.map(() => "?").join(", ");
    const exactRows = runQuery(
      `SELECT key, value FROM itemTable WHERE key IN (${exactPlaceholders}) LIMIT 50`,
      [...exactKeys],
    );
    for (const key of exactKeys) {
      const match = exactRows.find((row) => row?.key === key);
      if (match?.value !== undefined && match.value !== null) return match.value;
    }

    const fuzzyConditions = fuzzyPatterns.map(() => "key LIKE ?").join(" OR ");
    const fuzzyRows = runQuery(
      `SELECT key, value FROM itemTable WHERE ${fuzzyConditions} LIMIT 50`,
      [...fuzzyPatterns],
    );

    for (const pattern of fuzzyPatterns) {
      const normalizedPattern = String(pattern)
        .replace(/^%|%$/g, "")
        .toLowerCase();
      const match = fuzzyRows.find((row) =>
        String(row?.key || "").toLowerCase().includes(normalizedPattern),
      );
      if (match?.value !== undefined && match.value !== null) return match.value;
    }

    return null;
  };

  let accessToken = queryValue(ACCESS_TOKEN_KEYS, ["%accessToken%", "%token%"]);
  if (accessToken) accessToken = normalize(accessToken);

  let machineId = queryValue(MACHINE_ID_KEYS, ["%machineId%", "%serviceMachineId%"]);
  if (machineId) machineId = normalize(machineId);

  db.close();
  return {
    accessToken: typeof accessToken === "string" ? accessToken : null,
    machineId: typeof machineId === "string" ? machineId : null,
  };
}

async function extractTokensViaCLI(dbPath: string): Promise<TokenResult> {
  const normalizeCliValue = (raw: string): string => {
    const value = raw.trim();
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  };

  const query = async (sql: string): Promise<string> => {
    const { stdout } = await execFileAsync("sqlite3", [dbPath, sql], {
      timeout: 10000,
    });
    return stdout.trim();
  };

  let accessToken: TokenValue = null;
  for (const key of ACCESS_TOKEN_KEYS) {
    try {
      const raw = await query(`SELECT value FROM itemTable WHERE key='${key}' LIMIT 1`);
      if (raw) {
        accessToken = normalizeCliValue(raw);
        break;
      }
    } catch {
      /* try next */
    }
  }

  let machineId: TokenValue = null;
  for (const key of MACHINE_ID_KEYS) {
    try {
      const raw = await query(`SELECT value FROM itemTable WHERE key='${key}' LIMIT 1`);
      if (raw) {
        machineId = normalizeCliValue(raw);
        break;
      }
    } catch {
      /* try next */
    }
  }

  return { accessToken, machineId };
}

export async function GET() {
  try {
    const platform = process.platform;
    if (!["darwin", "linux", "win32"].includes(platform)) {
      return NextResponse.json({ found: false, error: "Unsupported platform" }, { status: 400 });
    }

    if (platform === "linux") {
      return NextResponse.json({
        found: false,
        error: "Cursor database not found. Make sure Cursor IDE is installed and you are logged in.",
      });
    }

    const candidates = getCandidatePaths(platform as SupportedPlatform);

    let dbPath: string | null = null;
    for (const candidate of candidates) {
      try {
        await access(candidate, constants.R_OK);
        dbPath = candidate;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!dbPath) {
      const isDarwin = platform === "darwin";
      const notFoundMessage = isDarwin
        ? "Cursor database not found in known macOS locations"
        : "Cursor database not found. Make sure Cursor IDE is installed and you are logged in.";

      return NextResponse.json({
        found: false,
        error: isDarwin
          ? `${notFoundMessage}\nChecked locations:\n${candidates.join("\n")}\n\nMake sure Cursor IDE is installed and opened at least once.`
          : notFoundMessage,
      });
    }

    try {
      const tokens = await extractTokensViaBetterSqlite(dbPath);
      if (tokens.accessToken && tokens.machineId) {
        return NextResponse.json({
          found: true,
          accessToken: tokens.accessToken,
          machineId: tokens.machineId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("SQLITE_CANTOPEN")) {
        return NextResponse.json({
          found: false,
          error: `Cursor database exists but could not open it: ${message}`,
        });
      }
    }

    try {
      const tokens = await extractTokensViaCLI(dbPath);
      if (tokens.accessToken && tokens.machineId) {
        return NextResponse.json({
          found: true,
          accessToken: tokens.accessToken,
          machineId: tokens.machineId,
        });
      }
    } catch {
      // sqlite3 CLI not available either
    }

    return NextResponse.json({
      found: false,
      error: "Please login to Cursor IDE first and reopen the app so the database is created.",
      windowsManual: true,
      dbPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("SQLITE_CANTOPEN")) {
      return NextResponse.json({
        found: false,
        error: `Cursor database exists but could not open it: ${message}`,
      });
    }
    console.log("Cursor auto-import error:", error);
    return NextResponse.json({ found: false, error: message }, { status: 500 });
  }
}
