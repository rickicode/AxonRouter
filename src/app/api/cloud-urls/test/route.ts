import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

type CloudUrlTestRequest = {
  url?: string;
};

type CloudUrlTestSuccessResponse = {
  success: boolean;
  status: "online" | "offline";
  latency: number;
  statusCode: number;
};

type CloudUrlTestErrorResponse = {
  error?: string;
  success?: false;
  status?: "error";
  latency?: null;
};

function normalizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Health check failed";
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export async function POST(
  request: Request,
): Promise<NextResponse<CloudUrlTestSuccessResponse | CloudUrlTestErrorResponse>> {
  const authError = await requireManagementAuth(request);
  if (authError) return authError as NextResponse<CloudUrlTestSuccessResponse | CloudUrlTestErrorResponse>;

  try {
    const body = (await request.json()) as CloudUrlTestRequest;
    const url = normalizeUrl(body?.url);

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!isValidHttpUrl(url)) {
      return NextResponse.json(
        { error: "URL must be a valid HTTP or HTTPS address" },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const latency = Date.now() - startedAt;

    return NextResponse.json({
      success: response.ok,
      status: response.ok ? "online" : "offline",
      latency,
      statusCode: response.status,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    const errorName = getErrorName(error);
    const isCors = errorMessage.includes("CORS") || errorName === "TypeError";

    return NextResponse.json(
      {
        success: false,
        status: "error",
        latency: null,
        error:
          errorName === "TimeoutError"
            ? "Request timed out"
            : isCors
              ? "CORS error - check worker configuration"
              : errorMessage,
      },
      { status: 503 },
    );
  }
}
