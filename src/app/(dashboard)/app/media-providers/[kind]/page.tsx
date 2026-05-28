"use client";

import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import AppIcon from "@/shared/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { translate } from "@/i18n/runtime";
import { DataState } from "@/shared/components/data";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";
import { getConnectionEffectiveStatus } from "@/lib/connectionStatus";
import { fetchJson, queryKeys } from "@/shared/query";

function getEffectiveStatus(conn) {
  return getConnectionEffectiveStatus(conn);
}

function MediaProviderCard({ provider, kind, connections, disabledModelsByProvider }) {
  const providerInfo = AI_PROVIDERS[provider.id];
  const isNoAuth = !!providerInfo?.noAuth;

  const providerConns = connections.filter((c) => c.provider === provider.id);
  const disabledCount = (disabledModelsByProvider?.[provider.alias] || disabledModelsByProvider?.[provider.id] || []).length;
  const connected = providerConns.filter((c) => { const s = getEffectiveStatus(c); return s === "active" || s === "success"; }).length;
  const error = providerConns.filter((c) => { const s = getEffectiveStatus(c); return s === "error" || s === "expired" || s === "unavailable"; }).length;
  const total = providerConns.length;
  const allDisabled = total > 0 && providerConns.every((c) => c.isActive === false);

  const renderStatus = () => {
    if (isNoAuth) return <Badge>{translate("Ready")}</Badge>;
    if (allDisabled) return <Badge variant="secondary">{translate("Disabled")}</Badge>;
    if (total === 0) return <span className="text-xs text-text-muted">{translate("No connections")}</span>;
    return (
      <>
        {connected > 0 && <Badge>{connected} {translate("Connected")}</Badge>}
        {error > 0 && <Badge variant="destructive">{error} {translate("Error")}</Badge>}
        {connected === 0 && error === 0 && <Badge variant="secondary">{total} {translate("Added")}</Badge>}
        {disabledCount > 0 && <Badge variant="secondary">{disabledCount} {translate("Disabled")}</Badge>}
      </>
    );
  };

  return (
    <Link href={`/app/media-providers/${kind}/${provider.id}`} className="group">
      <Card className={`h-full cursor-pointer transition-colors hover:bg-[var(--color-bg-alt)] ${allDisabled ? "opacity-50" : ""}`}>
        <CardContent className="flex items-center gap-3 p-3">
          <div
            className="size-8 rounded flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${provider.color?.length > 7 ? provider.color : (provider.color ?? "#888") + "15"}` }}
          >
            <ProviderIcon
              src={provider.id}
              alt={provider.name}
              size={30}
              className="object-contain rounded max-w-[30px] max-h-[30px]"
              fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{provider.name}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {renderStatus()}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function MediaProviderKindPage() {
  const { kind } = useParams();
  const searchQuery: any = useHeaderSearchStore((state: any) => state.query);
  const providersQuery = useQuery({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => fetchJson<{ connections?: any[] }>("/api/providers", { signal, cache: "no-store" }),
  });
  const disabledModelsQuery = useQuery({
    queryKey: queryKeys.disabledModels(),
    queryFn: ({ signal }) => fetchJson<{ disabled?: any }>("/api/models/disabled", { signal, cache: "no-store" }),
  });
  const connections = providersQuery.data?.connections || [];
  const disabledModelsByProvider = disabledModelsQuery.data?.disabled || {};

  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);

  const providers = getProvidersByKind(kind);
  const normalizedSearch = (searchQuery || "").trim().toLowerCase();
  const filteredProviders = providers.filter((provider) => {
    if (!normalizedSearch) return true;
    return [provider.name, provider.id, provider.alias, (provider as any).website].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const readyProviders = filteredProviders.filter((provider) => {
    const providerInfo = AI_PROVIDERS[provider.id];
    if (providerInfo?.noAuth) return true;
    return connections.some((c) => c.provider === provider.id && getEffectiveStatus(c) !== "error" && c.isActive !== false);
  }).length;
  const disabledProviders = filteredProviders.filter((provider) => {
    const providerConns = connections.filter((c) => c.provider === provider.id);
    return providerConns.length > 0 && providerConns.every((c) => c.isActive === false);
  }).length;

  if (!kindConfig) return notFound();

  if (providersQuery.isPending || disabledModelsQuery.isPending) {
    return <DataState variant="loading" title={translate("Loading media providers")} description={translate("Checking connections and disabled model state.")} />;
  }

  if (providersQuery.isError || disabledModelsQuery.isError) {
    return <DataState variant="error" title={translate("Failed to load media providers")} description={translate("Refresh the page and try again.")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase tracking-wider text-text-muted">{translate("Visible Providers")}</div><div className="mt-1 text-2xl font-semibold text-text-main">{filteredProviders.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase tracking-wider text-text-muted">{translate("Ready")}</div><div className="mt-1 text-2xl font-semibold text-text-main">{readyProviders}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase tracking-wider text-text-muted">{translate("Disabled")}</div><div className="mt-1 text-2xl font-semibold text-text-main">{disabledProviders}</div></CardContent></Card>
      </div>
      {providers.length === 0 ? (
        <DataState title={translate("No providers support")} description={`${kindConfig.label} ${translate("yet.")}`} icon="image" />
      ) : filteredProviders.length === 0 ? (
        <DataState title={translate("No media providers match current search.")} description={translate("Try a different dashboard search query.")} icon="search" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProviders.map((provider) => (
            <MediaProviderCard
              key={provider.id}
              provider={provider}
              kind={kind}
              connections={connections}
              disabledModelsByProvider={disabledModelsByProvider}
            />
          ))}
        </div>
      )}
    </div>
  );
}
