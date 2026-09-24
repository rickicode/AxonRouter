"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { CardSkeleton } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import EndpointUrlsCard from "./components/EndpointUrlsCard";
import ApiKeysCard from "./components/ApiKeysCard";
import QuickStartCard from "./components/QuickStartCard";
const emptySubscribe = () => () => {};

export default function EndpointPageClient({ machineId }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  // Settings state
  const [requireApiKey, setRequireApiKey] = useState(false);
  const [requireLogin, setRequireLogin] = useState(true);

  // Clipboard hook
  const { copied, copy } = useCopyToClipboard();

  // Client hydration check
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isRemoteHost =
    isClient && typeof window !== "undefined"
      ? !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
      : false;

  const baseUrl =
    isClient && typeof window !== "undefined"
      ? `${window.location.origin}/v1`
      : "/v1";

  const gatewayUrl =
    isClient && typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3778/v1`
      : "";

  // Data loaders
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (!res.ok) return;
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setRequireApiKey(data.requireApiKey || false);
        setRequireLogin(data.requireLogin !== false);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const loadInitialData = async () => {
      await Promise.all([fetchData(), loadSettings()]);
    };
    loadInitialData();
    return () => {
      ignore = true;
    };
  }, [fetchData, loadSettings]);

  const handleRequireApiKey = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApiKey: value }),
      });
      if (res.ok) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-machine-id={machineId}>
      {/* 1. Primary Active Endpoint URLs */}
      <EndpointUrlsCard
        baseUrl={baseUrl}
        gatewayUrl={gatewayUrl}
        copied={copied}
        onCopy={copy}
      />

      {/* 2. Quick Start Integration & Live Test */}
      <QuickStartCard
        baseUrl={baseUrl}
        gatewayUrl={gatewayUrl}
        activeKey={keys.find(k => k.isActive !== false)?.key || keys[0]?.key || ""}
      />

      {/* 3. API Keys Management */}
      <ApiKeysCard
        keys={keys}
        requireApiKey={requireApiKey}
        onToggleRequireApiKey={handleRequireApiKey}
        onKeysChange={fetchData}
        copied={copied}
        onCopy={copy}
        isRemoteHost={isRemoteHost}
      />
    </div>
  );
}

EndpointPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
