"use client";

import { useState, useEffect } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";

export default function MitmPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [providerModelsByProvider, setProviderModelsByProvider] = useState({});
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const [providersRes, keysRes, aliasesRes, providerModelsRes, settingsRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/keys"),
          fetch("/api/models/alias"),
          fetch("/api/provider-models"),
          fetch("/api/settings"),
        ]);

        if (!cancelled && providersRes.ok) {
          const data = await providersRes.json();
          setConnections(data.connections || []);
        }
        if (!cancelled && keysRes.ok) {
          const data = await keysRes.json();
          setApiKeys(data.keys || []);
        }
        if (!cancelled && aliasesRes.ok) {
          const data = await aliasesRes.json();
          setModelAliases(data.aliases || {});
        }
        if (!cancelled && providerModelsRes.ok) {
          const data = await providerModelsRes.json();
          setProviderModelsByProvider(data.models || {});
        }
        if (!cancelled && settingsRes.ok) {
          await settingsRes.json();
        }
      } catch {
        // ignore initial load failures
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const hasActiveProviders = () => {
    const active = getActiveProviders();
    return active.some(conn =>
      (providerModelsByProvider?.[conn.provider] || []).length > 0 ||
      isOpenAICompatibleProvider(conn.provider) ||
      isAnthropicCompatibleProvider(conn.provider)
    );
  };

  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex flex-col gap-6">
      {/* MITM Server Card */}
      <MitmServerCard
        apiKeys={apiKeys}
        onStatusChange={setMitmStatus}
      />

      {/* Tool Cards */}
      <div className="flex flex-col gap-2">
        {mitmTools.map(([toolId, tool]) => (
          <MitmToolCard
            key={toolId}
            tool={tool}
            isExpanded={expandedTool === toolId}
            onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)}
            serverRunning={mitmStatus.running}
            dnsActive={mitmStatus.dnsStatus?.[toolId] || false}
            hasCachedPassword={mitmStatus.hasCachedPassword || false}
            apiKeys={apiKeys}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders()}
            modelAliases={modelAliases}
            onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))}
          />
        ))}
      </div>
    </div>
  );
}
