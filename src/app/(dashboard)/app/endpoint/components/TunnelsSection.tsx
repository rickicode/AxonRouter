"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import TunnelCard from "./TunnelCard";

type TunnelStatus = {
  phase: string;
  running: boolean;
  publicUrl: string | null;
  apiUrl: string | null;
  lastError: string | null;
};

type NgrokStatus = TunnelStatus;

type TunnelsStatusResponse = {
  ngrok: NgrokStatus;
};

const TUNNELS_STATUS_KEY = ["tunnels-status"] as const;

export default function TunnelsSection() {
  const queryClient = useQueryClient();
  const [ngrokAuthToken, setNgrokAuthToken] = useState("");

  const statusQuery = useQuery<TunnelsStatusResponse>({
    queryKey: TUNNELS_STATUS_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/tunnel/status", { signal });
      if (!res.ok) throw new Error("Failed to fetch tunnel status");
      return res.json();
    },
    refetchInterval: 5000,
    initialData: {
      ngrok: { phase: "stopped", running: false, publicUrl: null, apiUrl: null, lastError: null },
    },
  });

  const status = statusQuery.data;

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
    <div className="grid gap-4 md:grid-cols-2">
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
