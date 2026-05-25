import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

import {
  listCurrentOpenCodeTokens,
  mutateCurrentOpenCodeTokens,
} from "@/lib/modelCatalogAccess";
import { createSyncToken, toPublicTokenRecord } from "@/lib/opencodeSync/tokens";

function isValidationError(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  return /^Invalid\b/u.test(message) || /required/u.test(message);
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const tokens = await listCurrentOpenCodeTokens();
    return NextResponse.json({
      tokens: (tokens || []).map((record) => toPublicTokenRecord(record)).filter(Boolean),
    });
  } catch (error) {
    console.log("Error loading OpenCode sync tokens:", error);
    return NextResponse.json({ error: "Failed to load OpenCode sync tokens" }, { status: 500 });
  }
}

export async function POST(request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload = await request.json();
    const { token, record } = createSyncToken(payload);
    await mutateCurrentOpenCodeTokens((tokens) => ({
      tokens: [...tokens, record],
    }));

    return NextResponse.json(
      {
        token,
        record: toPublicTokenRecord(record),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError || isValidationError(error)) {
      return NextResponse.json({ error: error?.message || "Invalid token payload" }, { status: 400 });
    }

    console.log("Error creating OpenCode sync token:", error);
    return NextResponse.json({ error: "Failed to create OpenCode sync token" }, { status: 500 });
  }
}
