import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { ensureUsageCheckSchedulerStarted } from "@/lib/usageCheckScheduler/bootstrap";
import { getUsageCheckScheduler } from "@/lib/usageCheckScheduler";

export const dynamic = "force-dynamic";

type RouteError = Error & {
  message: string;
};

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    await ensureUsageCheckSchedulerStarted();
    const status = getUsageCheckScheduler().getStatus();
    return NextResponse.json(status);
  } catch (error) {
    const routeError = error as RouteError;
    console.error("Error reading usage worker status:", routeError);
    return NextResponse.json({ error: routeError.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    await ensureUsageCheckSchedulerStarted();
    const result = await getUsageCheckScheduler().runScheduled();
    return NextResponse.json(result);
  } catch (error) {
    const routeError = error as RouteError;
    console.error("Error running usage check:", routeError);
    return NextResponse.json({ error: routeError.message }, { status: 500 });
  }
}
