import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  getCurrentOpenCodePreferences,
  updateCurrentOpenCodePreferences,
} from "@/lib/connectionAccess";

import {
  isOpenCodeValidationError,
  sanitizeOpenCodePreferencesForResponse,
} from "@/lib/opencodeSync/schema";

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isValidationError(error) {
  if (error instanceof SyntaxError || isOpenCodeValidationError(error)) {
    return true;
  }

  const message = typeof error?.message === "string" ? error.message : "";
  return /^Invalid\b/u.test(message) || /only valid/u.test(message);
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const preferences = await getCurrentOpenCodePreferences();
    return NextResponse.json({
      preferences: sanitizeOpenCodePreferencesForResponse(preferences),
    });
  } catch (error) {
    console.log("Error loading OpenCode preferences:", error);
    return NextResponse.json({ error: "Failed to load OpenCode preferences" }, { status: 500 });
  }
}

export async function PATCH(request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const payload = await request.json();

    if (!isPlainObject(payload)) {
      return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
    }

    const preferences = await updateCurrentOpenCodePreferences(payload);

    return NextResponse.json({
      preferences: sanitizeOpenCodePreferencesForResponse(preferences),
    });
  } catch (error) {
    if (isValidationError(error)) {
      return NextResponse.json({ error: error?.message || "Invalid preferences payload" }, { status: 400 });
    }

    console.log("Error updating OpenCode preferences:", error);
    return NextResponse.json({ error: "Failed to update OpenCode preferences" }, { status: 500 });
  }
}
