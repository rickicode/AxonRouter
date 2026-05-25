import { NextResponse } from "next/server";
import { getAggregateProviderModelsByProvider } from "@/lib/providerModels/aggregate";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const dynamic = "force-dynamic";

type ProviderModelsByProvider = Record<string, unknown[]>;

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");

    const modelsByProvider =
      (await getAggregateProviderModelsByProvider()) as ProviderModelsByProvider;

    if (provider) {
      return NextResponse.json({
        provider,
        models: modelsByProvider[provider] || [],
      });
    }

    return NextResponse.json({
      models: modelsByProvider,
    });
  } catch (error) {
    console.log("Error fetching provider models aggregate:", error);
    return NextResponse.json({ error: "Failed to fetch provider models" }, { status: 500 });
  }
}
