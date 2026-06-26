import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createCurrentProxyPool } from "@/lib/proxyPoolAccess";
import { buildRelayEdgeFunctionSource, generateRelayAuth } from "@/lib/relayTypes";

const DENO_API = "https://api.deno.com";

const RELAY_WORKER_CODE = buildRelayEdgeFunctionSource("deno");

async function pollRevision(revisionId: string, token: string, maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await fetch(`${DENO_API}/v2/revisions/${revisionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.status === "deployed") return data;
    if (data.status === "failed") throw new Error(`Deployment failed`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Deployment timed out");
}

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

// POST /api/proxy-pools/deno-deploy
export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const denoToken = body.denoToken;
    const orgDomain = body.orgDomain?.trim();
    const projectName = body.projectName?.trim() || `axonrelay-${Date.now().toString(36)}`;

    if (!denoToken) {
      return NextResponse.json({ error: "Deno Deploy token is required" }, { status: 400 });
    }
    if (!orgDomain) {
      return NextResponse.json({ error: "Organization domain is required" }, { status: 400 });
    }

    // Create Deno Deploy project
    const createRes = await fetch(`${DENO_API}/v2/apps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${denoToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        type: "playground",
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || "Failed to create Deno Deploy project" },
        { status: createRes.status }
      );
    }

    const project = await createRes.json();
    const projectId = project.id;

    // Deploy the relay function
    const relayAuth = generateRelayAuth();
    const deployRes = await fetch(`${DENO_API}/v2/apps/${projectId}/deploy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${denoToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entrypointUrl: "main.ts",
        manifest: {},
        assets: [
          {
            kind: "file",
            path: "main.ts",
            content: RELAY_WORKER_CODE,
            encoding: "utf-8",
          },
        ],
        envVars: {
          RELAY_AUTH: relayAuth,
        },
      }),
    });

    if (!deployRes.ok) {
      const err = await deployRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || "Failed to deploy to Deno Deploy" },
        { status: deployRes.status }
      );
    }

    const deployment = await deployRes.json();
    const revisionId = deployment.id || deployment.deploymentId;

    // Poll until deployment is ready
    await pollRevision(revisionId, denoToken);

    const deployUrl = `https://${projectName}.${orgDomain}.deno.net`;
    const relayTest = await testRelayDeployment(deployUrl, relayAuth);
    const testedAt = new Date().toISOString();

    const proxyPool = await createCurrentProxyPool({
      name: projectName,
      proxyUrl: deployUrl,
      type: "deno",
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
    console.log("Error deploying Deno relay:", error);
    return NextResponse.json({ error: message || "Deploy failed" }, { status: 500 });
  }
}
