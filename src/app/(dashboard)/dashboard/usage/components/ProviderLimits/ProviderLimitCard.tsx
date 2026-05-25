"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import QuotaProgressBar from "./QuotaProgressBar";
import { calculatePercentage } from "./utils";

const planVariants = {
  free: "secondary",
  pro: "default",
  ultra: "outline",
  enterprise: "outline",
};

export default function ProviderLimitCard({
  provider,
  name,
  plan,
  quotas = [],
  message = null,
  loading = false,
  error = null,
  onRefresh,
}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;

    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Get provider info from config
  const getProviderColor = () => {
    const colors = {
      github: "var(--foreground)",
      antigravity: "var(--color-info)",
      codex: "var(--color-success)",
      kiro: "var(--color-warning)",
      claude: "var(--primary)",
    };
    return colors[provider?.toLowerCase()] || "var(--muted-foreground)";
  };

  const providerColor = getProviderColor();
  const planVariant = planVariants[plan?.toLowerCase()] || "secondary";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-md p-1.5"
            style={{ backgroundColor: `${providerColor}15` }}
          >
            <ProviderIcon
              src={provider}
              alt={provider || "Provider"}
              size={40}
              className="rounded object-contain"
              fallbackText={provider?.slice(0, 2).toUpperCase() || "PR"}
              fallbackColor={providerColor}
            />
          </div>

          <div className="min-w-0">
            <CardTitle className="truncate text-base">{name || provider}</CardTitle>
            {plan ? (
              <Badge variant={planVariant} className="mt-1 w-fit text-[10px] uppercase tracking-[0.16em]">
                {plan}
              </Badge>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          title="Refresh quota"
          aria-label="Refresh quota"
          className="size-9 text-muted-foreground"
        >
          {refreshing || loading ? <Spinner className="size-4" /> : <AppIcon name="refresh" data-icon="inline-start" />}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2 w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-4/5" />
            </div>
          </div>
        )}

        {!loading && error && (
          <Alert variant="destructive">
            <AppIcon name="error" data-icon="inline-start" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && message && (
          <Alert>
            <AppIcon name="info" data-icon="inline-start" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && !message && quotas?.length > 0 && (
          <div className="space-y-4">
            {quotas.map((quota, index) => {
              // For Antigravity, use remainingPercentage if available, otherwise calculate
              const percentage =
                quota.remainingPercentage !== undefined
                  ? Math.round(quota.remainingPercentage)
                  : calculatePercentage(quota.used, quota.total);
              const unlimited = quota.total === 0 || quota.total === null;

              return (
                <QuotaProgressBar
                  key={`${quota.name}-${index}`}
                  label={quota.name}
                  used={quota.used}
                  total={quota.total}
                  percentage={percentage}
                  unlimited={unlimited}
                  resetTime={quota.resetAt}
                />
              );
            })}
          </div>
        )}

        {!loading && !error && !message && quotas?.length === 0 && (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia>
                <AppIcon name="data_usage" />
              </EmptyMedia>
              <EmptyTitle>No quota data available</EmptyTitle>
              <EmptyDescription>Refresh this provider when quota usage becomes available.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
