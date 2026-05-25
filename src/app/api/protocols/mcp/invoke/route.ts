import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const origin = new URL(request.url).origin;
    const body = await request.json().catch(() => ({}));
    const headers: any = {};
    const authorization = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");
    if (authorization) headers.authorization = authorization;
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetch(`${origin}/api/mcp/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
    return NextResponse.json(payload, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to invoke MCP tool', message: error?.message || String(error) }, { status: 500 });
  }
}
