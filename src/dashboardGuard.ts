import { NextResponse } from "next/server";
import { V4 } from "paseto";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { isLocalRequest, getClientIP } from "@/lib/security/ipValidator";
import {
	MANAGEMENT_SESSION_COOKIE_OPTIONS,
	MANAGEMENT_SESSION_TTL_PASETO,
} from "@/lib/auth/managementSession";

// Always require management token for critical routes.
const ALWAYS_PROTECTED = [
	"/api/shutdown",
	"/api/settings/database",
	"/api/version/update",
];

// Require auth for management APIs.
const PROTECTED_API_PATHS = [
	"/api/settings",
	"/api/keys",
	"/api/providers",
	"/api/provider-nodes",
	"/api/proxy-pools",
	"/api/credentials",
	"/api/combos",
	"/api/model-combo-mappings",
	"/api/models",
	"/api/oauth",
	"/api/opencode",
	"/api/tunnel",
	"/api/usage",
	"/api/cli-tools",
	"/api/skills",
	"/api/translator",
	"/api/morph",
];

function classifyTokenError(error) {
	const message =
		error instanceof Error
			? error.message.toLowerCase()
			: String(error || "").toLowerCase();
	if (message.includes("expired")) return "expired_token";
	if (message.includes("signature") || message.includes("verify"))
		return "invalid_signature";
	return "invalid_token";
}

async function verifyManagementToken(request) {
	const token = request.cookies.get("auth_token")?.value;
	if (!token) return { ok: false, reason: "missing_cookie" };
	try {
		const { getPasetoPublicKey } = await import("@/lib/security/pasetoKeys");
		const payload = await V4.verify(token, getPasetoPublicKey());
		return { ok: true, token, payload, reason: "valid_paseto" };
	} catch (error) {
		return { ok: false, token, reason: classifyTokenError(error) };
	}
}

async function refreshManagementTokenCookie(request, response, payload) {
	const { getPasetoPrivateKey } = await import("@/lib/security/pasetoKeys");
	const refreshed = await V4.sign(
		{ authenticated: payload?.authenticated === true },
		getPasetoPrivateKey(),
		{
			expiresIn: MANAGEMENT_SESSION_TTL_PASETO,
		},
	);

	response.cookies.set("auth_token", refreshed, {
		...MANAGEMENT_SESSION_COOKIE_OPTIONS,
		secure:
			request.url.startsWith("https:") ||
			request.headers.get("x-forwarded-proto") === "https",
	});
}

// Read settings directly from DB to avoid self-fetch deadlock in proxy
async function loadSettings() {
	try {
		return await getCurrentSettings();
	} catch {
		return null;
	}
}

async function logAudit(event: string, data: Record<string, unknown>) {
	const { auditLog } = await import("@/lib/security/auditLog");
	auditLog.log(event, data);
}

export async function proxy(request) {
	const { pathname } = request.nextUrl;
	const settings = await loadSettings();
	const clientIP = getClientIP(request, settings);

	// Always protected - allow localhost/whitelist or valid JWT only
	if (ALWAYS_PROTECTED.some((p) => pathname.startsWith(p))) {
		const isLocal = isLocalRequest(request, settings);
		const tokenState = await verifyManagementToken(request);
		const hasToken = tokenState.ok;

		if (settings?.auditLogEnabled) {
			await logAudit("auth_bypass_attempt", {
				ip: clientIP,
				path: pathname,
				allowed: isLocal || hasToken,
				reason: isLocal ? "localhost_whitelist" : tokenState.reason,
			});
		}

		if (isLocal || hasToken) {
			const response = NextResponse.next();
			if (tokenState.ok) {
				await refreshManagementTokenCookie(
					request,
					response,
					tokenState.payload,
				);
			}
			return response;
		}
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Protect sensitive API endpoints
	if (pathname === "/api/settings/require-login") {
		return NextResponse.next();
	}

	if (PROTECTED_API_PATHS.some((p) => pathname.startsWith(p))) {
		const isLocal = isLocalRequest(request, settings);
		const tokenState = await verifyManagementToken(request);
		const isAuth = tokenState.ok;

		if (settings?.auditLogEnabled) {
			await logAudit("auth_bypass_attempt", {
				ip: clientIP,
				path: pathname,
				allowed: isLocal || isAuth,
				reason: isLocal
					? "localhost_whitelist"
					: isAuth
						? "authenticated"
						: tokenState.reason,
			});
		}

		if (isLocal || isAuth) {
			const response = NextResponse.next();
			if (tokenState.ok) {
				await refreshManagementTokenCookie(
					request,
					response,
					tokenState.payload,
				);
			}
			return response;
		}
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Protect all dashboard routes
	if (pathname.startsWith("/app")) {
		// Verify PASETO token
		const tokenState = await verifyManagementToken(request);
		if (tokenState.ok) {
			const response = NextResponse.next();
			if (tokenState.ok) {
				await refreshManagementTokenCookie(
					request,
					response,
					tokenState.payload,
				);
			}
			return response;
		}

		if (settings?.auditLogEnabled) {
			await logAudit("paseto_validation_failed", {
				ip: clientIP,
				path: pathname,
				error: tokenState.reason,
				host: request.headers.get("host") || "",
				forwardedProto: request.headers.get("x-forwarded-proto") || "",
			});
		}

		return NextResponse.redirect(new URL("/login", request.url));
	}

	// Redirect / to /app
	if (pathname === "/") {
		return NextResponse.redirect(new URL("/app", request.url));
	}

	return NextResponse.next();
}
