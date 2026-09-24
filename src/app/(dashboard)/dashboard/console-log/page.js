"use client";

import dynamic from "next/dynamic";
import { CardSkeleton } from "@/shared/components";

const ConsoleLogClient = dynamic(() => import("./ConsoleLogClient"), {
  ssr: false,
  loading: () => (
    <div className="flex w-full flex-col gap-3">
      <CardSkeleton />
    </div>
  ),
});

export default function ConsoleLogPage() {
  return <ConsoleLogClient />;
}
