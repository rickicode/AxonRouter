import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { atomicUpdateCurrentSettings, getCurrentSettings } from "@/lib/settingsAccess";
import { MORPH_CORE_INTERNAL_MODELS } from "@/shared/constants/models";
import { buildMorphKeyStatusPatch } from "./shared";

type MorphApiKeyEntry = {
  email?: string;
  key?: string;
  status?: string;
  isExhausted?: boolean;
  lastCheckedAt?: string | null;
  lastError?: string;
};

type MorphSettings = {
  baseUrl?: string;
  apiKeys?: MorphApiKeyEntry[];
};

type TestKeyRequestBody = {
  email?: string;
};

function buildUpstreamUrl(baseUrl: string): string {
  return new URL("/v1/chat/completions", `${String(baseUrl).replace(/\/+$/, "")}/`).toString();
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => ({}))) as TestKeyRequestBody;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const settings = await getCurrentSettings();
    const morph = (settings?.morph || {}) as MorphSettings;
    const apiKeys = Array.isArray(morph.apiKeys) ? morph.apiKeys : [];
    const target = apiKeys.find((entry) => entry?.email === email);

    if (!target?.key) {
      return NextResponse.json({ error: "Morph API key not found" }, { status: 404 });
    }

    const response = await fetch(buildUpstreamUrl(String(morph.baseUrl)), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MORPH_CORE_INTERNAL_MODELS.fastValidation,
        messages: [
          {
            role: "user",
            content: "<instruction>Reply with exactly OK</instruction>",
          },
        ],
      }),
    });

    const responseText = await response.text().catch(() => "");
    const nextPatch = buildMorphKeyStatusPatch({
      status: response.status,
      responseText,
      fallbackLabel: `HTTP ${response.status}`,
    });
    const isActive = nextPatch.status === "active";

    await atomicUpdateCurrentSettings((current) => ({
      ...current,
      morph: {
        ...(current?.morph || {}),
        apiKeys: (Array.isArray(current?.morph?.apiKeys) ? current.morph.apiKeys : []).map((entry: MorphApiKeyEntry) => (
          entry?.email === email
            ? { ...entry, ...nextPatch }
            : entry
        )),
      },
    }));

    return NextResponse.json({
      ok: isActive,
      email,
      status: nextPatch.status,
      isExhausted: nextPatch.isExhausted,
      lastError: nextPatch.lastError,
    }, { status: isActive ? 200 : 409 });
  } catch (error) {
    console.error("[API] Failed to test Morph API key:", error);
    return NextResponse.json({ error: "Failed to test Morph API key" }, { status: 500 });
  }
}
