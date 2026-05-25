import { NextResponse } from "next/server";
import { getInternalProxyTokens } from "@/lib/internalProxyTokens";
import { applyProxyOutcomeReport, type InternalProxyOutcomeReport } from "./shared";

const INTERNAL_AUTH_HEADER = "x-internal-auth";

async function hasValidInternalAuth(request: Request): Promise<boolean> {
  const tokens = await getInternalProxyTokens();
  const expectedToken = tokens.reportToken;
  if (!expectedToken) return false;

  const providedToken = request.headers.get(INTERNAL_AUTH_HEADER);
  return Boolean(providedToken) && providedToken === expectedToken;
}

export async function POST(request: Request) {
  if (!(await hasValidInternalAuth(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let report: InternalProxyOutcomeReport;
  try {
    report = (await request.json()) as InternalProxyOutcomeReport;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  try {
    await applyProxyOutcomeReport(report);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "report_ingestion_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
