"use client";

import { CLI_TOOLS } from "@/shared/constants/cliTools";
import ToolSummaryCard from "./components/ToolSummaryCard";

export default function CLIToolsPageClient() {
  const regularTools = Object.entries(CLI_TOOLS);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3">
        {regularTools.map(([toolId, tool]) => (
          <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} />
        ))}
      </div>
    </div>
  );
}
