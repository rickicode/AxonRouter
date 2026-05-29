"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import TunnelCard from "./TunnelCard";

type TunnelStatus = {
  phase: string;
  running: boolean;
  publicUrl: string | null;
  apiUrl: string | null;
  lastError: string | null;
};

type TailscaleStatus = TunnelStatus & {
  enabled?: boolean;
  loggedIn?: boolean;
  tunnelUrl?: string | null;
};

type NgrokStatus = TunnelStatus;

type TunnelsStatusResponse = {
  cloudflared: TunnelStatus;
  tailscale: TailscaleStatus;
  ngrok: NgrokStatus;
};

const TUNNELS_STATUS_KEY = ["tunnels-status"] as const;

export default function TunnelsSection() {
  const queryClient = useQueryClient();
  const [ngrokAuthToken, setNgrokAuthToken] = useState("");
  const [tailscaleAuthUrl, setTailscaleAuthUrl] = useState<string | null>(null);

  const statusQuery = useQuery<TunnelsStatusResponse>({
    queryKey: TUNNELS_STATUS_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/tunnel/status", { signal });
      if (!res.ok) throw new Error("Failed to fetch tunnel status");
      return res.json();
    },
    refetchInterval: 5000,
    initialData: {
      cloudflared: { phase: "stopped", running: false, publicUrl: null, apiUrl: null, lastError: null },
      tailscale: { phase: "stopped", running: false, publicUrl: null, apiUrl: null, lastError: null },
      ngrok: { phase: "stopped", running: false, publicUrl: null, apiUrl: null, lastError: null },
    },
  });

  const status = statusQuery.data;

  const cloudflaredStart = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tunnel/cloudflared/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start cloudflared");
      return res.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY }); },
  });

  const cloudflaredStop = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tunnel/cloudflared/stop", { method: "POST" });
      if (!res.ok) throw new Error("Failed to stop cloudflared");
      return res.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY }); },
  });

  const tailscaleStart = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tunnel/tailscale/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start tailscale");
      return res.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY }); },
  });

  const tailscaleStop = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tunnel/tailscale/stop", { method: "POST" });
      if (!res.ok) throw new Error("Failed to stop tailscale");
      return res.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY }); },
  });

  const tailscaleLogin = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tunnel/tailscale/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to initiate tailscale login");
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.authUrl) {
        setTailscaleAuthUrl(data.authUrl);
      }
      void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY });
    },
  });

  const ngrokStart = useMutation({
    mutationFn: async (authToken?: string) => {
      const res = await fetch("/api/tunnel/ngrok/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken: authToken || undefined }),
      });
      if (!res.ok) throw new Error("Failed to start ngrok");
      return res.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY }); },
  });

  const ngrokStop = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tunnel/ngrok/stop", { method: "POST" });
      if (!res.ok) throw new Error("Failed to stop ngrok");
      return res.json();
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: TUNNELS_STATUS_KEY }); },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Cloudflared */}
      <TunnelCard
        name="Cloudflared"
        description="Quick tunnel via Cloudflare's network. No account required."
        phase={status.cloudflared.phase}
        running={status.cloudflared.running}
        publicUrl={status.cloudflared.publicUrl}
        apiUrl={status.cloudflared.apiUrl}
        lastError={status.cloudflared.lastError}
        onStart={() => cloudflaredStart.mutate()}
        onStop={() => cloudflaredStop.mutate()}
        isLoading={cloudflaredStart.isPending || cloudflaredStop.isPending}
      />

      {/* Tailscale */}
      <TunnelCard
        name="Tailscale"
        description="Funnel through your Tailscale network. Requires Tailscale login."
        phase={status.tailscale.phase}
        running={status.tailscale.running}
        publicUrl={status.tailscale.publicUrl || status.tailscale.tunnelUrl || null}
        apiUrl={status.tailscale.apiUrl}
        lastError={status.tailscale.lastError}
        onStart={() => tailscaleStart.mutate()}
        onStop={() => tailscaleStop.mutate()}
        isLoading={tailscaleStart.isPending || tailscaleStop.isPending || tailscaleLogin.isPending}
      >
        {status.tailscale.phase === "needs_login" && (
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => tailscaleLogin.mutate()}
              disabled={tailscaleLogin.isPending}
            >
              Login to Tailscale
            </Button>
            {tailscaleAuthUrl && (
              <a
                href={tailscaleAuthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open auth URL
              </a>
            )}
          </div>
        )}
      </TunnelCard>

      {/* Ngrok */}
      <TunnelCard
        name="Ngrok"
        description="Tunnel via ngrok. Requires auth token."
        phase={status.ngrok.phase}
        running={status.ngrok.running}
        publicUrl={status.ngrok.publicUrl}
        apiUrl={status.ngrok.apiUrl}
        lastError={status.ngrok.lastError}
        onStart={() => ngrokStart.mutate(ngrokAuthToken || undefined)}
        onStop={() => ngrokStop.mutate()}
        isLoading={ngrokStart.isPending || ngrokStop.isPending}
      >
        {status.ngrok.phase === "needs_auth" && (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter ngrok auth token"
              value={ngrokAuthToken}
              onChange={(e) => setNgrokAuthToken(e.target.value)}
              className="flex-1 text-xs"
              type="password"
            />
          </div>
        )}
      </TunnelCard>
    </div>
  );
}
