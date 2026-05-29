"use client";

import AppIcon from "@/shared/components/AppIcon";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

/**
 * Clickable card for MITM tools — navigates to /app/mitm on click.
 */
export default function MitmLinkCard({ tool }) {
  return (
    <Link href="/app/mitm" className="block">
      <Card className="cursor-pointer overflow-hidden transition-colors hover:border-primary/50">
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 flex items-center justify-center shrink-0">
              <Image
                src={tool.image}
                alt={tool.name}
                width={32}
                height={32}
                className="size-8 object-contain rounded-lg"
                sizes="32px"
                onError={(e) => { (e.target as any).style.display = "none"; }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm">{tool.name}</h3>
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full">MITM</span>
              </div>
              <p className="text-xs text-text-muted truncate">{tool.description}</p>
            </div>
          </div>
          <AppIcon name="chevron_right" size={20} className="text-text-muted" />
        </CardContent>
      </Card>
    </Link>
  );
}
