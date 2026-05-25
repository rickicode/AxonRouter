import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getMorphUsageStats } from "@/lib/morphUsageDb";
import { getCurrentProviderNodes } from "@/lib/modelCatalogAccess";
import { getKnownProviders } from "@/lib/requestDetailsDb";
import {
  AI_PROVIDERS,
  getProviderByAlias,
  MORPH_MANAGED_PROVIDER_ID,
} from "@/shared/constants/providers";

type ProviderNode = {
  id: string;
  name: string;
};

type MorphUsageStats = {
  byCapability?: {
    apply?: {
      requests?: number;
    };
  };
  byModel?: Record<string, unknown>;
};

/**
 * GET /api/usage/providers
 * Returns list of unique providers from request details
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const providerIds = (await getKnownProviders()) as string[];
    const morphUsage = (await getMorphUsageStats("all")) as MorphUsageStats;

    const providerNodes = (await getCurrentProviderNodes()) as ProviderNode[];
    const nodeMap: Record<string, string> = {};
    for (const node of providerNodes) {
      nodeMap[node.id] = node.name;
    }

    const knownProviderIds = new Set(providerIds);
    if (
      (morphUsage.byCapability?.apply?.requests || 0) > 0 ||
      (morphUsage.byModel && Object.keys(morphUsage.byModel).length > 0)
    ) {
      knownProviderIds.add(MORPH_MANAGED_PROVIDER_ID);
    }

    const providers = [...knownProviderIds].map((providerId: string) => {
      let name = providerId;
      if (nodeMap[providerId]) {
        name = nodeMap[providerId];
      } else {
        const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
        if (providerConfig?.name) name = providerConfig.name;
      }
      return { id: providerId, name };
    });

    return NextResponse.json({ providers });
  } catch (error) {
    console.error("[API] Failed to get providers:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}
