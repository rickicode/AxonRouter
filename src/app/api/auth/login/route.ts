import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { V4 } from "paseto";
import { cookies } from "next/headers";
import { getClientIP } from "@/lib/security/ipValidator";
import { auditLog } from "@/lib/security/auditLog";
import { getPasetoPrivateKey } from "@/lib/security/pasetoKeys";
import { assertProductionConfigReady } from "@/lib/security/productionConfig";
import { getLoginSettings } from "@/lib/auth/loginSettingsAccess";
import { MANAGEMENT_SESSION_COOKIE_OPTIONS, MANAGEMENT_SESSION_TTL_PASETO } from "@/lib/auth/managementSession";
import { DEFAULT_DASHBOARD_PASSWORD } from "@/shared/constants/auth";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

type LoginAttemptRecord = {
  count: number;
  resetAt: number;
};

type LoginSettings = {
  password?: string;
  auditLogEnabled?: boolean;
};

const loginAttempts = new Map<string, LoginAttemptRecord>();

function pruneExpiredLoginAttempts(now = Date.now()) {
  for (const [ip, data] of loginAttempts.entries()) {
    if (data.resetAt < now) {
      loginAttempts.delete(ip);
    }
  }
}

class RateLimitMutex {
  private _queue: Array<() => void> = [];
  private _locked = false;

  async acquire(): Promise<() => void> {
    if (!this._locked) {
      this._locked = true;
      return () => this._release();
    }

    return new Promise((resolve) => {
      this._queue.push(() => resolve(() => this._release()));
    });
  }

  private _release() {
    const next = this._queue.shift();
    if (next) next();
    else this._locked = false;
  }
}

const rateLimitMutex = new RateLimitMutex();

async function checkRateLimit(ip: string) {
  const release = await rateLimitMutex.acquire();
  try {
    const now = Date.now();
    pruneExpiredLoginAttempts(now);
    const record = loginAttempts.get(ip);

    if (!record || record.resetAt < now) {
      loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return { allowed: true, resetAt: now + WINDOW_MS };
    }

    if (record.count >= MAX_ATTEMPTS) {
      return {
        allowed: false,
        resetAt: record.resetAt,
        remainingMs: record.resetAt - now,
      };
    }

    record.count += 1;
    return { allowed: true, resetAt: record.resetAt };
  } finally {
    release();
  }
}

async function resetRateLimit(ip: string) {
  const release = await rateLimitMutex.acquire();
  try {
    loginAttempts.delete(ip);
  } finally {
    release();
  }
}

export async function POST(request: Request) {
  try {
    assertProductionConfigReady();
    const settings = (await getLoginSettings()) as LoginSettings;
    const clientIP = getClientIP(request, settings);

    const rateLimit = await checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.ceil((rateLimit.remainingMs || 0) / 1000);

      if (settings?.auditLogEnabled) {
        auditLog.log("rate_limit_exceeded", {
          ip: clientIP,
          attempts: MAX_ATTEMPTS,
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        });
      }

      return NextResponse.json(
        {
          error: `Too many login attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
          retryAfter: retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": retryAfterSeconds.toString() },
        }
      );
    }

    const { password } = (await request.json()) as { password?: string };

    const storedHash = settings.password;

    // AUTOFIX F01: when no password is configured (storedHash is empty/null) and this
    // is a non-localhost (tunnel/remote) request, reject login. The default password
    // must never be accepted over a network-exposed endpoint — the admin must set a
    // real password via localhost first before enabling remote/tunnel access.
    const isRemoteRequest = !["127.0.0.1", "::1"].some(
      (local) => (getClientIP(request, settings) || "").startsWith(local)
    );
    if (!storedHash && isRemoteRequest) {
      if (settings?.auditLogEnabled) {
        auditLog.log("login_attempt", {
          ip: clientIP,
          success: false,
          reason: "no_password_configured_remote_blocked",
        });
      }
      return NextResponse.json(
        { error: "No dashboard password has been configured. Please set a password via localhost access first." },
        { status: 403 }
      );
    }

    const isValid = storedHash
      ? await bcrypt.compare(password || "", storedHash)
      : (password || "") === DEFAULT_DASHBOARD_PASSWORD;

    if (isValid) {
      await resetRateLimit(clientIP);

      const forwardedProto = request.headers.get("x-forwarded-proto");
      const isHttpsRequest = forwardedProto === "https" || request.url.startsWith("https:");
      const useSecureCookie = isHttpsRequest;
      const token = await V4.sign(
        { authenticated: true },
        getPasetoPrivateKey(),
        {
          expiresIn: MANAGEMENT_SESSION_TTL_PASETO,
        }
      );

      const cookieStore = await cookies();
      cookieStore.set("auth_token", token, {
        ...MANAGEMENT_SESSION_COOKIE_OPTIONS,
        secure: useSecureCookie,
      });

      if (settings?.auditLogEnabled) {
        auditLog.log("login_attempt", {
          ip: clientIP,
          success: true,
        });
      }

      return NextResponse.json({ success: true });
    }

    if (settings?.auditLogEnabled) {
      auditLog.log("login_attempt", {
        ip: clientIP,
        success: false,
        reason: "invalid_password",
      });
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
