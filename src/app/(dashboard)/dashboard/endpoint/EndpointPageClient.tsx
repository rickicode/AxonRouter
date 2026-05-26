"use client";

import PropTypes from "prop-types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlQueryControls } from "@/shared/hooks";
import MainTab from "./components/MainTab";
import ProtocolsTab from "./components/ProtocolsTab";

export default function EndpointPageClient({ machineId }) {
  const { getQueryValue, updateQueryParams } = useUrlQueryControls({
    fallbackPath: "/dashboard",
  });

  const tabFromUrl = getQueryValue("tab", "");
  const activeTab = ["protocols"].includes(tabFromUrl) ? tabFromUrl : "main";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    updateQueryParams({ tab: value === "main" ? null : value });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">Endpoint control</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-[var(--color-text-main)]">Gateway access and protocol surfaces</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
            Manage local API keys, remote access, and protocol interoperability without leaving the AxonRouter dashboard shell.
          </p>
        </div>
        <ToggleGroup type="single" value={activeTab} onValueChange={(next) => next && handleTabChange(next)} aria-label="Endpoint sections">
          {[
            { value: "main", label: "Main" },
            { value: "protocols", label: "Protocols" },
          ].map((item) => (
            <ToggleGroupItem key={item.value} value={item.value} className="min-w-20">
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {activeTab === "main" && <MainTab machineId={machineId} />}
      {activeTab === "protocols" && <ProtocolsTab />}
    </div>
  );
}

EndpointPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
