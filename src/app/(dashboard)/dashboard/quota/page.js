export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";
import Icon from "@/shared/components/Icon";

export default function QuotaPage() {
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <Icon name="data_usage" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-text-main mb-1">Quota Tracker</h1>
            <p className="text-sm text-text-muted">Monitor API quota limits, usage, and reset times across all provider accounts</p>
          </div>
        </div>
      </div>

      {/* Quota Grid */}
      <Suspense fallback={<CardSkeleton />}>
        <ProviderLimits />
      </Suspense>
    </div>
  );
}
