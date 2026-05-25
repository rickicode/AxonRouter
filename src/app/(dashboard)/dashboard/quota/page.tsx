import { Suspense } from "react";
import ProviderLimits from "../usage/components/ProviderLimits";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { pageTitle } from "@/shared/constants/site";

export const metadata = { title: pageTitle("Quota Tracker") };

function QuotaLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

export default function QuotaPage() {
  return (
    <Suspense fallback={<QuotaLoading />}>
      <ProviderLimits />
    </Suspense>
  );
}
