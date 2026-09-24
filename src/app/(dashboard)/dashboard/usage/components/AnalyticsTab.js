"use client";

import { useState } from "react";
import Card from "@/shared/components/Card";
import AnalyticsWaffleGrid from "./AnalyticsWaffleGrid";
import AnalyticsBrickTimeline from "./AnalyticsBrickTimeline";
import TopProvidersCard from "./TopProvidersCard";
import { useAnalytics } from "./useAnalytics";
import AnalyticsFilterBar from "./AnalyticsFilterBar";
import AnalyticsSummaryCards from "./AnalyticsSummaryCards";
import AnalyticsErrorDistribution from "./AnalyticsErrorDistribution";
import AnalyticsRankings from "./AnalyticsRankings";
import AnalyticsModelTable from "./AnalyticsModelTable";
import FailureAnalyticsCard from "./FailureAnalyticsCard";
import FailureResponseModal from "./FailureResponseModal";
import Icon from "@/shared/components/Icon";

export default function AnalyticsTab({ period }) {
 const analytics = useAnalytics(period);

 // Failure response modal state for top providers and model table
 const [modalOpen, setModalOpen] = useState(false);
 const [modalTarget, setModalTarget] = useState({ title: "", type: "model" });
 const [modalFailures, setModalFailures] = useState([]);
 const [modalLoading, setModalLoading] = useState(false);

 const handleInspectFailures = async (target, type = "model") => {
 const isModel = type === "model" || Boolean(target.model);
 const title = isModel ? `${target.provider}/${target.model}` : target.provider;
 setModalTarget({ title, type: isModel ? "model" : "provider" });
 setModalOpen(true);
 setModalLoading(true);
 setModalFailures([]);

 try {
 const params = new URLSearchParams({ limit: "25" });
 if (isModel) {
 params.set("provider", target.provider);
 params.set("model", target.model);
 } else {
 params.set("provider", target.provider);
 }

 // First try /api/usage/analytics/failures
 const res = await fetch(`/api/usage/analytics/failures?${params.toString()}`);
 if (res.ok) {
 const json = await res.json();
 if (json.recentFailures && json.recentFailures.length > 0) {
 setModalFailures(json.recentFailures);
 setModalLoading(false);
 return;
 }
 }

 // Fallback: /api/usage/request-details?status=failed
 const fbParams = new URLSearchParams({
 status: "failed",
 pageSize: "25",
 });
 if (isModel) {
 fbParams.set("provider", target.provider);
 fbParams.set("model", target.model);
 } else {
 fbParams.set("provider", target.provider);
 }
 const fbRes = await fetch(`/api/usage/request-details?${fbParams.toString()}`);
 if (fbRes.ok) {
 const fbJson = await fbRes.json();
 setModalFailures(fbJson.details || []);
 }
 } catch (e) {
 console.error("Error fetching failed responses:", e);
 } finally {
 setModalLoading(false);
 }
 };

 return (
 <section className="flex min-w-0 max-w-full flex-col gap-3">
 {/* Header & Subtitle */}
 <div className="flex flex-col gap-1">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <Icon name="monitoring" size={18} className="text-primary shrink-0 inline-flex items-center justify-center" />
 <h2 className="text-sm font-semibold text-text-main">
 Model Analytics
 </h2>
 </div>
 {analytics.data?.summary && (
 <span className="text-xs text-text-muted font-mono">
 Last updated: {new Date().toLocaleTimeString("en-US")}
 </span>
 )}
 </div>
 <p className="text-sm text-text-muted">
 New routed LLM attempts only. Retries count separately. Reliability
 and speed measure service performance, not answer quality. In-memory
 telemetry is best-effort; crashes or overload can drop events.
 </p>
 </div>

 {/* Filter Bar */}
 <AnalyticsFilterBar analytics={analytics} period={period} />

 {/* Loading & Error States */}
 {analytics.loading && (
 <Card
 padding="lg"
 className="flex items-center justify-center p-3 text-text-muted text-sm"
 >
 <Icon name="progress_activity" size={18} className="animate-spin mr-2" />
 Loading analytics…
 </Card>
 )}

 {analytics.error && (
 <Card
 padding="md"
 className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-danger/30 bg-danger/10 text-danger"
 >
 <p role="alert" className="font-medium text-sm">
 {analytics.error}
 </p>
 <button
 type="button"
 onClick={() => analytics.setRefresh((x) => x + 1)}
 className="px-3 py-1 text-xs font-medium rounded-sm border border-danger/30 bg-danger/10 hover:bg-danger/10 text-danger"
 >
 Retry
 </button>
 </Card>
 )}

 {analytics.data && (
 <>
 <AnalyticsSummaryCards data={analytics.data} />

 {!analytics.data.models.length ? (
 <Card padding="lg" className="text-center">
 <p className="text-text-muted">
 No events recorded in this period. New requests will appear
 after recording starts.
 </p>
 </Card>
 ) : (
 <>
                <AnalyticsBrickTimeline data={analytics.data.series} />
                <AnalyticsWaffleGrid data={analytics.data} />

 <TopProvidersCard
 byProvider={analytics.data.byProvider || []}
 onProviderClick={(p) => analytics.handleProviderChange(p)}
 onInspectFailures={(p) => handleInspectFailures(p, "provider")}
 />

 <AnalyticsErrorDistribution
 data={analytics.data}
 errorCategory={analytics.errorCategory}
 setErrorCategory={analytics.setErrorCategory}
 />

 {/* Dedicated Failure Intelligence & Error Responses Card */}
 <FailureAnalyticsCard
 data={analytics.data}
 onSelectModel={(prov, mod) => analytics.handleSelectModel(prov, mod)}
 onSelectProvider={(prov) => analytics.handleProviderChange(prov)}
 />

 <AnalyticsRankings
 data={analytics.data}
 handleSelectModel={analytics.handleSelectModel}
 />

 <AnalyticsModelTable
 data={analytics.data}
 handleSelectModel={analytics.handleSelectModel}
 onInspectFailures={(m) => handleInspectFailures(m, "model")}
 />

 </>
 )}
 </>
 )}

 {/* Shared Failure Response Modal */}
 <FailureResponseModal
 isOpen={modalOpen}
 onClose={() => setModalOpen(false)}
 targetTitle={modalTarget.title}
 targetType={modalTarget.type}
 failures={modalFailures}
 loading={modalLoading}
 />
 </section>
 );
}
