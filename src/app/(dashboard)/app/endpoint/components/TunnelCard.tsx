"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Loader2, Play, Square } from "lucide-react";
import { useState } from "react";

type TunnelCardProps = {
  name: string;
  description: string;
  phase: string;
  running: boolean;
  publicUrl: string | null;
  apiUrl: string | null;
  lastError: string | null;
  onStart: () => void;
  onStop: () => void;
  isLoading: boolean;
  children?: React.ReactNode;
};

function getStatusBadge(phase: string, running: boolean) {
  if (running) {
    return <Badge className="border-green-500/25 bg-green-500/15 text-green-600">Running</Badge>;
  }
  switch (phase) {
    case "starting":
      return <Badge className="border-yellow-500/25 bg-yellow-500/15 text-yellow-600">Starting</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    case "needs_auth":
      return <Badge className="border-orange-500/25 bg-orange-500/15 text-orange-600">Needs Auth</Badge>;
    case "needs_login":
      return <Badge className="border-orange-500/25 bg-orange-500/15 text-orange-600">Needs Login</Badge>;
    default:
      return <Badge variant="secondary">Stopped</Badge>;
  }
}

export default function TunnelCard({
  name,
  description,
  phase,
  running,
  publicUrl,
  apiUrl,
  lastError,
  onStart,
  onStop,
  isLoading,
  children,
}: TunnelCardProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(id);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold">{name}</CardTitle>
          {getStatusBadge(phase, running)}
        </div>
        <Button
          size="sm"
          variant={running ? "destructive" : "default"}
          onClick={running ? onStop : onStart}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : running ? (
            <Square className="mr-1 h-4 w-4" />
          ) : (
            <Play className="mr-1 h-4 w-4" />
          )}
          {running ? "Stop" : "Start"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>

        {running && publicUrl && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="flex-1 truncate font-mono text-xs">{publicUrl}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => copyToClipboard(publicUrl, "public")}
                aria-label="Copy public URL"
              >
                <Copy className={`h-3.5 w-3.5 ${copiedUrl === "public" ? "text-green-500" : ""}`} />
              </Button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {apiUrl && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">API:</span>
                <span className="flex-1 truncate font-mono text-xs">{apiUrl}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => copyToClipboard(apiUrl, "api")}
                  aria-label="Copy API URL"
                >
                  <Copy className={`h-3.5 w-3.5 ${copiedUrl === "api" ? "text-green-500" : ""}`} />
                </Button>
              </div>
            )}
          </div>
        )}

        {lastError && (
          <p className="text-sm text-destructive">{lastError}</p>
        )}

        {children}
      </CardContent>
    </Card>
  );
}
