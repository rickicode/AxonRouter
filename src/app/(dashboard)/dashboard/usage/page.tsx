"use client";

import { Suspense, lazy } from "react";
import { useUrlQueryControls } from "@/shared/hooks";
import { UsageStats, RequestLogger } from "@/shared/components";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RequestDetailsTab from "./components/RequestDetailsTab";

const IncidentsTab = lazy(() => import("./components/IncidentsTab"));

export default function UsagePage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full rounded-[4px]" />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const { getQueryValue, updateQueryParams } = useUrlQueryControls({
    fallbackPath: "/dashboard/usage",
  });

  const tabFromUrl = getQueryValue("tab", "");
  const activeTab = tabFromUrl && ["overview", "details", "incidents"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    updateQueryParams({ tab: value });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col gap-6">
      <Card className="bg-card/95 shadow-[var(--shadow-card)]">
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 rounded-[4px] px-3 py-1 text-[10px] uppercase tracking-[0.22em]">
              Usage intelligence
            </Badge>
            <CardTitle className="text-2xl font-extrabold tracking-[-0.03em]">Router traffic overview</CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6">
              Track request volume, provider activity, and incidents across AxonRouter.
            </CardDescription>
          </div>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
          </TabsList>
        </CardHeader>
      </Card>

      <TabsContent value="overview" className="mt-0">
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-[4px]" />}>
          <UsageStats />
        </Suspense>
      </TabsContent>
      <TabsContent value="logs" className="mt-0">
        <RequestLogger />
      </TabsContent>
      <TabsContent value="details" className="mt-0">
        <RequestDetailsTab />
      </TabsContent>
      <TabsContent value="incidents" className="mt-0">
        <Suspense fallback={<Skeleton className="h-40 w-full rounded-[4px]" />}>
          <IncidentsTab />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
