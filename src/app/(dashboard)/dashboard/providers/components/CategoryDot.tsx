"use client";

import { cn } from "@/lib/utils";

const CATEGORY_DOT_COLORS: Record<string, string> = {
  Free: "bg-green-500",
  OAuth: "bg-blue-500",
  "API Key": "bg-purple-500",
  "Free Tier": "bg-emerald-500",
  Local: "bg-gray-500",
  Search: "bg-amber-500",
  Audio: "bg-pink-500",
  System: "bg-slate-500",
  "OpenAI Compatible": "bg-cyan-500",
  "Anthropic Compatible": "bg-cyan-500",
  Image: "bg-rose-500",
  "Web Cookie": "bg-orange-500",
};

interface CategoryDotProps {
  category: string;
  className?: string;
}

export function CategoryDot({ category, className }: CategoryDotProps) {
  const color = CATEGORY_DOT_COLORS[category] || "bg-cyan-500";
  return (
    <span
      className={cn("size-2 rounded-full shrink-0 inline-block", color, className)}
      title={category}
    />
  );
}

export { CATEGORY_DOT_COLORS };
