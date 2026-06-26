import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createCurrentProxyPool } from "@/lib/proxyPoolAccess";
import { buildRelayEdgeFunctionSource, generateRelayAuth } from "@/lib/relayTypes";

const RELAY_WORKER_CODE = buildRelayEdgeFunctionSource("cloudflare");

async function testRelayDeployment(relayUrl: string, relayAuth?: string, timeoutMs = 30000) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "x-relay-target": "https://api64.ipify.org",
      "x-relay-path": "/?format=json",
    };
    if (relayAuth) headers["x-relay-auth"] = relayAuth;
    const res = await fetch(relayUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    return {
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      error: res.ok ? null : `Relay test failed with status ${res.status}`,
    };
  } catch (err) {
    const error = err as { name?: string; message?: string } | undefined;
    return {
      ok: false,
      status: 500,
      elapsedMs: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "Relay test timed out" : error?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/proxy-pools/cloudflare-deploy
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const cfToken = body.cfToken;
    const accountId = body.accountId?.trim();
    const projectName = body.projectName?.trim() || `axonrelay-${Date.now().toString(36)}`;

    if (!cfToken) {
      return NextResponse.json({ error: "Cloudflare API token is required" }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const relayAuth = generateRelayAuth();

    // Deploy worker script
    const deployRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/javascript",
        },
        body: RELAY_WORKER_CODE.replace(
          "env.RELAY_AUTH",
          `"${relayAuth}"`
        ),
      }
    );

    if (!deployRes.ok) {
      const err = await deployRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.errors?.[0]?.message || "Failed to deploy Cloudflare Worker" },
        { status: deployRes.status }
      );
    }

    // Enable workers.dev subdomain
    const subdomainRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectName}/subdomain`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      }
    );

    // Get the workers.dev URL
    const settingsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectName}/settings`,
      {
        headers: { Authorization: `Bearer ${cfToken}` },
      }
    );
    const settings = await settingsRes.json();
    const workersDevSubdomain = settings.result?.workers_dev_subdomain || `${projectName}.${accountId.slice(0, 8)}.workers.dev`;
    const deployUrl = `https://${workersDevSubdomain}`;

    const relayTest = await testRelayDeployment(deployUrl, relayAuth);
    const testedAt = new Date().toISOString();

    const proxyPool = await createCurrentProxyPool({
      name: projectName,
      proxyUrl: deployUrl,
      type: "cloudflare",
      relayAuth,
      noProxy: "",
      isActive: relayTest.ok,
      strictProxy: false,
      testStatus: relayTest.ok ? "active" : "error",
      lastTestedAt: testedAt,
      lastError: relayTest.ok ? null : relayTest.error,
    });

    return NextResponse.json({ proxyPool, deployUrl, relayTest }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deploy failed";
    console.log("Error deploying Cloudflare Worker:", error);
    return NextResponse.json({ error: message || "Deploy failed" }, { status: 500 });
  }
}
