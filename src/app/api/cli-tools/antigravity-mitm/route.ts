import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  loadAntigravityMitmManager,
  resolveAntigravityMitmPassword,
} from "@/lib/mitm/antigravityRuntime";
import { getAntigravityMitmStatusPayload } from "@/lib/mitm/antigravityStatusAccess";

type PostBody = {
  apiKey?: string;
  sudoPassword?: string;
  mitmRouterBaseUrl?: unknown;
};

type DeleteBody = {
  sudoPassword?: string;
};

type PatchBody = {
  tool?: string;
  action?: string;
  sudoPassword?: string;
};

const isWin = process.platform === "win32";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getExecSync() {
  const { execSync } = require("child_process") as typeof import("child_process");
  return execSync;
}

function checkIsAdmin(): boolean {
  if (!isWin) return true;
  try {
    getExecSync()("net session >nul 2>&1", { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    return NextResponse.json(await getAntigravityMitmStatusPayload());
  } catch (error) {
    console.log("Error getting MITM status:", getErrorMessage(error));
    return NextResponse.json({ error: "Failed to get MITM status" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { apiKey, sudoPassword, mitmRouterBaseUrl } = (await request.json()) as PostBody;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing apiKey" }, { status: 400 });
    }

    const {
      startServer,
      getCachedPassword,
      setCachedPassword,
      loadEncryptedPassword,
      setMitmRouterBaseUrl,
    } = await loadAntigravityMitmManager();

    if (mitmRouterBaseUrl !== undefined && mitmRouterBaseUrl !== null) {
      try {
        await setMitmRouterBaseUrl(mitmRouterBaseUrl);
      } catch (error) {
        return NextResponse.json(
          { error: getErrorMessage(error) || "Invalid MITM router URL" },
          { status: 400 }
        );
      }
    }
    const pwd = await resolveAntigravityMitmPassword(
      { getCachedPassword, loadEncryptedPassword },
      sudoPassword,
    );

    if (!isWin && !pwd) {
      return NextResponse.json({ error: "Missing apiKey or sudoPassword" }, { status: 400 });
    }

    const result = await startServer(apiKey, pwd);
    if (!isWin) setCachedPassword(pwd);

    return NextResponse.json({ success: true, running: result.running, pid: result.pid });
  } catch (error) {
    console.log("Error starting MITM server:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) || "Failed to start MITM server" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { stopServer, getCachedPassword, setCachedPassword, loadEncryptedPassword } =
      await loadAntigravityMitmManager();
    const body = ((await request.json().catch(() => ({}))) as DeleteBody);
    const { sudoPassword } = body;
    const pwd = await resolveAntigravityMitmPassword(
      { getCachedPassword, loadEncryptedPassword },
      sudoPassword,
    );

    if (!isWin && !pwd) {
      return NextResponse.json({ error: "Missing sudoPassword" }, { status: 400 });
    }

    await stopServer(pwd);
    if (!isWin && sudoPassword) setCachedPassword(sudoPassword);

    return NextResponse.json({ success: true, running: false });
  } catch (error) {
    console.log("Error stopping MITM server:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) || "Failed to stop MITM server" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { tool, action, sudoPassword } = (await request.json()) as PatchBody;

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }

    const {
      enableToolDNS,
      disableToolDNS,
      trustCert,
      getCachedPassword,
      setCachedPassword,
      loadEncryptedPassword,
      getMitmStatus,
    } = await loadAntigravityMitmManager();
    const pwd = await resolveAntigravityMitmPassword(
      { getCachedPassword, loadEncryptedPassword },
      sudoPassword,
    );

    if (!isWin && !pwd) {
      return NextResponse.json({ error: "Missing sudoPassword" }, { status: 400 });
    }

    if (action === "trust-cert") {
      await trustCert(pwd);
      if (!isWin && sudoPassword) setCachedPassword(sudoPassword);
      const status = await getMitmStatus();
      return NextResponse.json({ success: true, certTrusted: status.certTrusted });
    }

    if (!tool) {
      return NextResponse.json({ error: "tool required" }, { status: 400 });
    }

    if (action === "enable") {
      await enableToolDNS(tool, pwd);
    } else if (action === "disable") {
      await disableToolDNS(tool, pwd);
    } else {
      return NextResponse.json({ error: "action must be enable, disable, or trust-cert" }, { status: 400 });
    }

    if (!isWin && sudoPassword) setCachedPassword(sudoPassword);

    const status = await getMitmStatus();
    return NextResponse.json({ success: true, dnsStatus: status.dnsStatus });
  } catch (error) {
    console.log("Error toggling DNS:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) || "Failed to toggle DNS" }, { status: 500 });
  }
}
