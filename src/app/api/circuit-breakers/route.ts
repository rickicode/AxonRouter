import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { circuitBreakerRegistry } from "../../../../open-sse/services/circuitBreaker";

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  return NextResponse.json({ breakers: circuitBreakerRegistry.getAllStatuses() });
}

export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  circuitBreakerRegistry.resetAll();
  return NextResponse.json({ success: true });
}
