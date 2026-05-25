import { NextResponse } from "next/server";
import { V4 } from "paseto";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { getClientIP, isLocalRequest } from "@/lib/security/ipValidator";
import { auditLog } from "@/lib/security/auditLog";
import { getPasetoPublicKey } from "@/lib/security/pasetoKeys";

function getAuthCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("auth_token="))
    ?.slice("auth_token=".length);
}

function classifyTokenError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("expired")) return "expired_token";
  if (message.includes("signature") || message.includes("verify")) return "invalid_signature";
  return "invalid_token";
}

async function getTokenState(request: Request) {
  const token = getAuthCookie(request);
  if (!token) return { valid: false, reason: "missing_cookie" };

  try {
    await V4.verify(token, getPasetoPublicKey());
    return { valid: true, reason: "valid_paseto" };
  } catch (error) {
    return { valid: false, reason: classifyTokenError(error) };
  }
}

export async function requireManagementAuth(request: Request) {
  const settings = await getCurrentSettings().catch(() => null);
  const isLocal = isLocalRequest(request, settings);
  const tokenState = await getTokenState(request);

  if (settings?.auditLogEnabled) {
    const url = new URL(request.url);
    auditLog.log("management_auth_attempt", {
      ip: getClientIP(request, settings),
      path: url.pathname,
      allowed: isLocal || tokenState.valid,
      reason: isLocal ? "localhost_whitelist" : tokenState.reason,
      host: request.headers.get("host") || url.host,
      forwardedProto: request.headers.get("x-forwarded-proto") || "",
    });
  }

  if (isLocal || tokenState.valid) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
