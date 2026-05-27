import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SuggestedModel = {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

type SuggestedModelResponse =
  | { id: string; name: string; contextLength: number }
  | { id: string; name: string };

type ModelFilter = (models: SuggestedModel[]) => SuggestedModelResponse[];

const FILTERS: Record<string, ModelFilter> = {
  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          typeof m.context_length === "number" &&
          m.context_length >= 200000,
      )
      .map((m) => ({
        id: m.id ?? "",
        name: m.name ?? "",
        contextLength: m.context_length,
      }))
      .sort((a, b) => b.contextLength - a.contextLength),

  "opencode-free": (models) =>
    models
      .filter((m): m is SuggestedModel & { id: string } => typeof m.id === "string" && m.id.endsWith("-free"))
      .map((m) => ({ id: m.id, name: m.id })),

  "opencode-zen": (models) =>
    models
      .filter((m): m is SuggestedModel & { id: string } => typeof m.id === "string")
      .map((m) => ({ id: m.id, name: m.name ?? m.id })),
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const type = searchParams.get("type");

  if (!url || !type) {
    return NextResponse.json({ error: "Missing url or type" }, { status: 400 });
  }

  const filter = FILTERS[type];
  if (!filter) {
    return NextResponse.json({ error: "Unknown filter type" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ data: [] });
    }
    const json: unknown = await res.json();
    const source = typeof json === "object" && json !== null ? (json as { data?: unknown; models?: unknown }) : null;
    const raw = source?.data ?? source?.models ?? json;
    const data = filter(Array.isArray(raw) ? (raw as SuggestedModel[]) : []);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
