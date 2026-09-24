"use client";

import Link from "next/link";
import { CardSkeleton } from "@/shared/components";
import { useProviderDetail } from "./useProviderDetail";
import ProviderHeader from "./ProviderHeader";
import ConnectionsSection from "./ConnectionsSection";
import ModelsSection from "./ModelsSection";
import ProviderModals from "./ProviderModals";

export default function ProviderDetailPage() {
 const d = useProviderDetail();

 if (d.loading) {
 return (
 <div className="flex flex-col gap-3">
 <CardSkeleton />
 <CardSkeleton />
 </div>
 );
 }

 if (!d.providerInfo) {
 return (
 <div className="text-center py-20">
 <p className="text-text-muted">Provider not found</p>
<Link href="/dashboard/providers" className="text-primary mt-4 inline-flex min-h-11 items-center sm:min-h-0">
 Back to Providers
 </Link>
 </div>
 );
 }

 return (
<div className="flex min-w-0 flex-col gap-3 px-1 sm:gap-3 sm:px-0">
    <ProviderHeader {...d} connectionCount={d.connectionStats?.total || d.connectionPagination?.total || d.connections.length} />
 <ConnectionsSection {...d} />
 <ModelsSection {...d} />
 <ProviderModals {...d} />
 </div>
 );
}
