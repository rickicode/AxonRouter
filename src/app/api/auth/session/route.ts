import { NextResponse } from "next/server";
import { V4 } from "paseto";
import { getPasetoPublicKey } from "@/lib/security/pasetoKeys";

function classifyTokenError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("expired")) return "expired_token";
  if (message.includes("signature") || message.includes("verify")) return "invalid_signature";
  return "invalid_token";
}

export async function GET(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("auth_token="))
    ?.slice("auth_token=".length);

  const url = new URL(request.url);
  const base = {
    host: request.headers.get("host") || url.host,
    forwardedProto: request.headers.get("x-forwarded-proto") || "",
    secureRequest: url.protocol === "https:",
  };

  if (!token) {
    return NextResponse.json({ authenticated: false, reason: "missing_cookie", ...base });
  }

  try {
    const payload = await V4.verify(token, getPasetoPublicKey());
    return NextResponse.json({ authenticated: true, reason: "valid_paseto", payload, ...base });
  } catch (error) {
    return NextResponse.json({ authenticated: false, reason: classifyTokenError(error), ...base });
  }
}
