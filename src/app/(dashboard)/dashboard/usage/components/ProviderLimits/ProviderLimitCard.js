"use client";

import { useState } from "react";
import Card from "@/shared/components/Card";
import ProviderIcon from "@/shared/components/ProviderIcon";
import Badge from "@/shared/components/Badge";
import QuotaProgressBar from "./QuotaProgressBar";
import { calculatePercentage } from "./utils";
import Icon from "@/shared/components/Icon";

const planVariants = {
 free: "default",
 pro: "primary",
 ultra: "success",
 enterprise: "info",
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
 github: "#000000",
 antigravity: "#4285F4",
 codex: "#10A37F",
 kiro: "#FF9900",
 qoder: "#EC4899",
 claude: "#D97757",
 };
 return colors[provider?.toLowerCase()] || "#6B7280";
 };

 const providerColor = getProviderColor();
 const planVariant = planVariants[plan?.toLowerCase()] || "default";

 return (
 <Card padding="md" className="flex flex-col gap-3">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 {/* Provider Logo */}
 <div
 className="size-8 rounded-sm flex items-center justify-center"
 style={{ backgroundColor: `${providerColor}15` }}
 >
 <ProviderIcon
 src={`/providers/${provider}.png`}
 alt={provider || "Provider"}
 size={40}
 className="object-contain rounded-sm"
 fallbackText={provider?.slice(0, 2).toUpperCase() || "PR"}
 fallbackColor={providerColor}
 />
 </div>

 <div>
 <h3 className="font-medium text-text-main">
 {name || provider}
 </h3>
 {plan && (
 <Badge
 variant={planVariants[plan?.toLowerCase()] || "default"}
 size="xs"
 >
 {plan}
 </Badge>
 )}
 </div>
 </div>

 {/* Refresh Button */}
 <button
 onClick={handleRefresh}
 disabled={refreshing || loading}
 className="size-8 rounded-sm hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
 title="Refresh quota"
 >
 <Icon name="refresh" size={18} className={`text-text-muted ${ refreshing || loading ? "animate-spin" : "" }`} />
 </button>
 </div>

 {/* Loading State */}
 {loading && (
 <div className="space-y-3">
 <div className="space-y-3">
 <div className="h-4 bg-surface rounded-sm animate-pulse" />
 <div className="h-2 bg-surface rounded-sm animate-pulse" />
 </div>
 <div className="space-y-3">
 <div className="h-4 bg-surface rounded-sm animate-pulse" />
 <div className="h-2 bg-surface rounded-sm animate-pulse" />
 </div>
 </div>
 )}

 {/* Error State */}
 {!loading && error && (
 <div className="p-3 rounded-sm bg-danger/10 border border-danger/30">
 <div className="flex items-start gap-2">
 <Icon name="error" size={18} className="text-danger" />
 <p className="text-sm text-danger">{error}</p>
 </div>
 </div>
 )}

 {/* Info Message (for providers without API) */}
 {!loading && !error && message && (
 <div className="p-3 rounded-sm bg-primary/10 border border-primary/30">
 <div className="flex items-start gap-2">
 <Icon name="info" size={18} className="text-primary" />
 <p className="text-sm text-primary">
 {message}
 </p>
 </div>
 </div>
 )}

 {/* Quota Progress Bars */}
 {!loading && !error && !message && quotas?.length > 0 && (
 <div className="space-y-3">
 {quotas.map((quota, index) => {
 // For Antigravity, use remainingPercentage if available, otherwise calculate
 const percentage =
 quota.remainingPercentage !== undefined
 ? Math.round(((quota.total - quota.used) / quota.total) * 100)
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
 recurring={quota.recurring !== false}
 />
 );
 })}
 </div>
 )}

 {/* Empty State */}
 {!loading && !error && !message && quotas?.length === 0 && (
 <div className="text-center py-3 text-text-muted">
 <Icon name="data_usage" size={48} className="text-text-muted" />
 <p className="text-sm mt-2">No quota data available</p>
 </div>
 )}
 </Card>
 );
}
