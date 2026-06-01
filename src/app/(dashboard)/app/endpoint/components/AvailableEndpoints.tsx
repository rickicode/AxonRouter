"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Globe, Server } from "lucide-react";
import { useState } from "react";
import { queryKeys } from "@/shared/query";

type TunnelStatus = {
  phase: string;
  running: boolean;
  publicUrl: string | null;
  apiUrl: string | null;
  lastError: string | null;
};

type TunnelsStatusResponse = {
  ngrok: TunnelStatus;
};

type ProviderItem = {
  id: string;
  provider: string;
  name?: string;
  status?: string;
};

const LOCAL_ENDPOINT = "http://localhost:12711/v1";
const TUNNELS_STATUS_KEY = ["tunnels-status"] as const;

export default function AvailableEndpoints() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const tunnelQuery = useQuery<TunnelsStatusResponse>({
    queryKey: TUNNELS_STATUS_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/tunnel/status", { signal });
      if (!res.ok) throw new Error("Failed to fetch tunnel status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const providersQuery = useQuery<ProviderItem[]>({
    queryKey: queryKeys.providers(),
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/providers", { signal });
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    },
  });

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const tunnelData = tunnelQuery.data;
  const activeEndpoints: { label: string; url: string; id: string }[] = [];

  if (tunnelData?.ngrok?.running && tunnelData.ngrok.apiUrl) {
    activeEndpoints.push({ label: "Ngrok", url: tunnelData.ngrok.apiUrl, id: "ngrok" });
  }

  const providers = providersQuery.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Available Endpoints</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Local endpoint */}
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Local</span>
          <span className="flex-1 truncate font-mono text-xs">{LOCAL_ENDPOINT}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => copyToClipboard(LOCAL_ENDPOINT, "local")}
            aria-label="Copy local endpoint"
          >
            <Copy className={`h-3.5 w-3.5 ${copiedId === "local" ? "text-green-500" : ""}`} />
          </Button>
        </div>

        {/* Active tunnel endpoints */}
        {activeEndpoints.map((endpoint) => (
          <div key={endpoint.id} className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{endpoint.label}</span>
            <span className="flex-1 truncate font-mono text-xs">{endpoint.url}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => copyToClipboard(endpoint.url, endpoint.id)}
              aria-label={`Copy ${endpoint.label} endpoint`}
            >
              <Copy className={`h-3.5 w-3.5 ${copiedId === endpoint.id ? "text-green-500" : ""}`} />
            </Button>
          </div>
        ))}

        {/* Configured providers */}
        {providers.length > 0 && (
          <div className="mt-2 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Configured Providers</p>
            <div className="flex flex-wrap gap-2">
              {providers.slice(0, 20).map((provider) => (
                <Badge key={provider.id} variant="secondary" className="text-xs">
                  {provider.provider || provider.name || provider.id}
                </Badge>
              ))}
              {providers.length > 20 && (
                <Badge variant="outline" className="text-xs">
                  +{providers.length - 20} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
