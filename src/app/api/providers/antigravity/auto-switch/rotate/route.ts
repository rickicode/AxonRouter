"use server";

import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { checkAndRotateAntigravityAccount } from "@/lib/antigravityAutoSwitch";

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const newConnectionId = await checkAndRotateAntigravityAccount();

    if (newConnectionId) {
      return NextResponse.json({
        rotated: true,
        newConnectionId,
      });
    }

    return NextResponse.json({
      rotated: false,
      message: "No rotation needed or no other account available",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to rotate Antigravity CLI account";
    console.error("Error rotating Antigravity CLI account:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
