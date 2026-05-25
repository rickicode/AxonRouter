"use client";

import Link from "next/link";
import AppIcon from "@/shared/components/AppIcon";
import { Card, CardContent } from "@/components/ui/card";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";

export default function MediaProvidersIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Media Providers</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage non-LLM AI capabilities: images, audio, video, embeddings, and more.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MEDIA_PROVIDER_KINDS.map((kind) => (
          <Link key={kind.id} href={`/dashboard/media-providers/${kind.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-3 p-4">
                <AppIcon name={kind.icon} size={24} className="text-muted-foreground" />
                <div>
                  <p className="font-medium">{kind.label}</p>
                  <p className="text-xs text-muted-foreground">{kind.endpoint.path}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
