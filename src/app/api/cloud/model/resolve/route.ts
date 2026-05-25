import { NextResponse } from "next/server";
import { validateCurrentApiKey } from "@/lib/apiKeyAccess";
import { getCurrentModelAliases } from "@/lib/modelAliasAccess";

type ResolveModelRequestBody = {
  alias?: string;
};

type ErrorResponse = {
  error: string;
};

type ResolveModelResponse = {
  alias: string;
  provider: string;
  model: string;
};

// Resolve model alias to provider/model
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json<ErrorResponse>({ error: "Missing API key" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    const body = (await request.json()) as ResolveModelRequestBody;
    const { alias } = body;

    if (!alias) {
      return NextResponse.json<ErrorResponse>({ error: "Missing alias" }, { status: 400 });
    }

    const isValid = await validateCurrentApiKey(apiKey);
    if (!isValid) {
      return NextResponse.json<ErrorResponse>({ error: "Invalid API key" }, { status: 401 });
    }

    const modelAliases = (await getCurrentModelAliases()) as Record<string, string | undefined>;
    const resolved = modelAliases[alias];

    if (resolved) {
      const firstSlash = resolved.indexOf("/");
      if (firstSlash > 0) {
        return NextResponse.json<ResolveModelResponse>({
          alias,
          provider: resolved.slice(0, firstSlash),
          model: resolved.slice(firstSlash + 1),
        });
      }
    }

    return NextResponse.json<ErrorResponse>({ error: "Alias not found" }, { status: 404 });
  } catch (error) {
    console.log("Model resolve error:", error);
    return NextResponse.json<ErrorResponse>({ error: "Internal error" }, { status: 500 });
  }
}
