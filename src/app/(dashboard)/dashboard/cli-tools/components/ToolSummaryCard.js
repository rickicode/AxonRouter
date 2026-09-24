"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/shared/components";
import Icon from "@/shared/components/Icon";

export default function ToolSummaryCard({ toolId, tool }) {
  const isGuide = tool.configType === "guide";
  return (
    <Link href={`/dashboard/cli-tools/${toolId}`} className="block">
      <Card padding="sm" className="h-full overflow-hidden hover:border-primary/30 cursor-pointer">
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="size-8 flex items-center justify-center shrink-0">
              {tool.image ? (
                <Image
                  src={tool.image}
                  alt={tool.name}
                  width={32}
                  height={32}
                  className="size-8 object-contain rounded-sm"
                  sizes="32px"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                  loading="lazy"
                  decoding="async"
                />
              ) : tool.icon ? (
                <Icon name={tool.icon} size={18} style={{ color: tool.color }} />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm truncate">{tool.name}</h3>
              <span className="inline-block mt-1 px-1.5 py-1 text-[11px] font-medium rounded-sm bg-primary/10 text-primary">
                {isGuide ? "Guide" : "One-Click Setup"}
              </span>
            </div>
            <Icon className="text-text-muted shrink-0" name="chevron_right" size={18} />
          </div>
        </div>
      </Card>
    </Link>
  );
}
