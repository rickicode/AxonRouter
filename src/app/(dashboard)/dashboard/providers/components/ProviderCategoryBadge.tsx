"use client";

import { Badge } from "@/components/ui/badge";
import { getProviderCategory } from "@/shared/constants/providers";

const CATEGORY_COLORS: Record<string, string> = {
  Free: "border-green-500/30 bg-green-500/15 text-green-500",
  OAuth: "border-blue-500/30 bg-blue-500/15 text-blue-500",
  "API Key": "border-purple-500/30 bg-purple-500/15 text-purple-500",
  "Free Tier": "border-emerald-500/30 bg-emerald-500/15 text-emerald-500",
  Local: "border-gray-500/30 bg-gray-500/15 text-gray-500",
  Search: "border-amber-500/30 bg-amber-500/15 text-amber-500",
  Audio: "border-pink-500/30 bg-pink-500/15 text-pink-500",
  System: "border-slate-500/30 bg-slate-500/15 text-slate-500",
  "OpenAI Compatible": "border-cyan-500/30 bg-cyan-500/15 text-cyan-500",
  "Anthropic Compatible": "border-cyan-500/30 bg-cyan-500/15 text-cyan-500",
  Image: "border-rose-500/30 bg-rose-500/15 text-rose-500",
  "Web Cookie": "border-orange-500/30 bg-orange-500/15 text-orange-500",
};

export function ProviderCategoryBadge({ providerId }: { providerId: string }) {
  const category = getProviderCategory(providerId);
  const colorClass = CATEGORY_COLORS[category] || "border-cyan-500/30 bg-cyan-500/15 text-cyan-500";

  return (
    <Badge variant="outline" className={colorClass}>
      {category}
    </Badge>
  );
}
