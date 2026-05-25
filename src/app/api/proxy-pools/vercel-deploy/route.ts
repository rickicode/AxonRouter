import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createCurrentProxyPool } from "@/lib/proxyPoolAccess";

const VERCEL_API = "https://api.vercel.com";

// Relay function source code deployed to Vercel
// Forwards requests to target URL specified in x-relay-target header
const RELAY_FUNCTION_CODE = `
export const config = { runtime: "edge" };

export default async function handler(req) {
  const target = req.headers.get("x-relay-target");
  const relayPath = req.headers.get("x-relay-path") || "/";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target header" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUrl = target.replace(/\\/$/, "") + relayPath;

  const headers = new Headers(req.headers);
  headers.delete("x-relay-target");
  headers.delete("x-relay-path");
  headers.delete("host");

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    duplex: "half",
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
`;

async function pollDeployment(deploymentId, token, maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.readyState === "READY") return data;
    if (data.readyState === "ERROR" || data.readyState === "CANCELED") {
      throw new Error(`Deployment failed: ${data.readyState}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Deployment timed out");
}

async function testRelayDeployment(relayUrl: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(relayUrl, {
      method: "GET",
      headers: {
        "x-relay-target": "https://httpbin.org",
        "x-relay-path": "/get",
      },
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

// POST /api/proxy-pools/vercel-deploy
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const vercelToken = body.vercelToken;
    const projectName = body.projectName?.trim() || `relay-${Date.now().toString(36)}`;

    if (!vercelToken) {
      return NextResponse.json({ error: "Vercel API token is required" }, { status: 400 });
    }

    // Deploy relay function to Vercel
    const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        files: [
          {
            file: "api/relay.js",
            data: RELAY_FUNCTION_CODE,
          },
          {
            file: "package.json",
            data: JSON.stringify({ name: projectName, version: "1.0.0" }),
          },
          {
            file: "vercel.json",
            data: JSON.stringify({
              rewrites: [{ source: "/(.*)", destination: "/api/relay" }],
            }),
          },
        ],
        projectSettings: {
          framework: null,
        },
        target: "production",
      }),
    });

    if (!deployRes.ok) {
      const err = await deployRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error?.message || "Failed to create Vercel deployment" },
        { status: deployRes.status }
      );
    }

    const deployment = await deployRes.json();
    const deploymentId = deployment.id || deployment.uid;

    // Disable deployment protection (Vercel Authentication)
    const projectId = deployment.projectId || projectName;
    const protectionRes = await fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ssoProtection: null }),
    });

    if (!protectionRes.ok) {
      const err = await protectionRes.json().catch(() => ({}));
      throw new Error(err.error?.message || "Failed to disable Vercel deployment protection");
    }

    // Poll until deployment is ready, then verify the relay before saving it.
    const ready = await pollDeployment(deploymentId, vercelToken);
    const deployUrl = `https://${ready.url}`;
    const relayTest = await testRelayDeployment(deployUrl);
    const testedAt = new Date().toISOString();

    // Create proxy pool entry with generic relay type
    const proxyPool = await createCurrentProxyPool({
      name: projectName,
      proxyUrl: deployUrl,
      type: "relay",
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
    console.log("Error deploying Vercel relay:", error);
    return NextResponse.json({ error: message || "Deploy failed" }, { status: 500 });
  }
}
