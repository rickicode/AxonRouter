import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type TestSingleConnectionResult = {
  valid: boolean;
  error: string | null | undefined;
  refreshed?: boolean;
};

// POST /api/providers/[id]/test - Test connection
export async function POST(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const { testSingleConnection } = await import("./testUtils");
    const result = (await testSingleConnection(id)) as TestSingleConnectionResult;

    if (result.error === "Connection not found") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
