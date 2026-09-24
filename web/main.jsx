import "@fontsource-variable/inter";
import "@/app/globals.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";
import { DashboardLayout } from "@/shared/components";

import LoginPage from "@/app/login/page.js";
import LandingPage from "@/app/landing/page.js";
import CallbackPage from "@/app/callback/page.js";

import AppPageClient from "@/app/(dashboard)/dashboard/app/AppPageClient.js";
import BenchmarkPage from "@/app/(dashboard)/dashboard/benchmark/page.js";
import CLIToolsPageClient from "@/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js";
import ToolDetailClient from "@/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js";
import CombosPage from "@/app/(dashboard)/dashboard/combos/page.js";
import ConsoleLogPage from "@/app/(dashboard)/dashboard/console-log/page.js";
import MediaKindPage from "@/app/(dashboard)/dashboard/media-providers/[kind]/page.js";
import MediaKindIdPage from "@/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page.js";
import MediaComboPage from "@/app/(dashboard)/dashboard/media-providers/combo/[...id]/page.js";
import MediaWebPage from "@/app/(dashboard)/dashboard/media-providers/web/page.js";
import ProvidersPage from "@/app/(dashboard)/dashboard/providers/page.js";
import ProviderNewPage from "@/app/(dashboard)/dashboard/providers/new/page.js";
import ProviderDetailPage from "@/app/(dashboard)/dashboard/providers/[id]/page.js";
import ProxyPoolsPage from "@/app/(dashboard)/dashboard/proxy-pools/page.js";
import QuotaPage from "@/app/(dashboard)/dashboard/quota/page.js";
import SettingsPage from "@/app/(dashboard)/dashboard/settings/page.js";
import PricingSettingsPage from "@/app/(dashboard)/dashboard/settings/pricing/page.js";
import UsagePage from "@/app/(dashboard)/dashboard/usage/page.js";

let machineIdPromise = null;
function fetchMachineId() {
  machineIdPromise ??= fetch("/api/system/machine-id")
    .then((r) => (r.ok ? r.json() : { machineId: "" }))
    .then((d) => d.machineId || "")
    .catch(() => "");
  return machineIdPromise;
}

function useMachineId() {
  const [machineId, setMachineId] = useState("");
  useEffect(() => {
    let alive = true;
    fetchMachineId().then((id) => alive && setMachineId(id));
    return () => {
      alive = false;
    };
  }, []);
  return machineId;
}

function Shell({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function MachineIdPage({ Page, ...extra }) {
  const machineId = useMachineId();
  return (
    <Shell>
      <Page machineId={machineId} {...extra} />
    </Shell>
  );
}

function ToolIdPage() {
  const { toolId } = useParams();
  const machineId = useMachineId();
  return (
    <Shell>
      <ToolDetailClient toolId={toolId} machineId={machineId} />
    </Shell>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <RuntimeI18nProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/callback" element={<CallbackPage />} />

            <Route path="/dashboard" element={<MachineIdPage Page={AppPageClient} />} />
            <Route path="/dashboard/app" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard/endpoint" element={<Navigate to="/dashboard?tab=endpoint" replace />} />
            <Route path="/dashboard/profile" element={<Navigate to="/dashboard/settings" replace />} />
            <Route path="/dashboard/proxy-fitness" element={<Navigate to="/dashboard/proxy-pools?tab=fitness" replace />} />

            <Route path="/dashboard/benchmark" element={<Shell><BenchmarkPage /></Shell>} />
            <Route path="/dashboard/cli-tools" element={<Shell><CLIToolsPageClient /></Shell>} />
            <Route path="/dashboard/cli-tools/:toolId" element={<ToolIdPage />} />
            <Route path="/dashboard/combos" element={<Shell><CombosPage /></Shell>} />
            <Route path="/dashboard/console-log" element={<Shell><ConsoleLogPage /></Shell>} />
            <Route path="/dashboard/media-providers/web" element={<Shell><MediaWebPage /></Shell>} />
            <Route path="/dashboard/media-providers/combo/*" element={<Shell><MediaComboPage /></Shell>} />
            <Route path="/dashboard/media-providers/:kind" element={<Shell><MediaKindPage /></Shell>} />
            <Route path="/dashboard/media-providers/:kind/:id" element={<Shell><MediaKindIdPage /></Shell>} />
            <Route path="/dashboard/providers" element={<Shell><ProvidersPage /></Shell>} />
            <Route path="/dashboard/providers/new" element={<Shell><ProviderNewPage /></Shell>} />
            <Route path="/dashboard/providers/:id" element={<Shell><ProviderDetailPage /></Shell>} />
            <Route path="/dashboard/proxy-pools" element={<Shell><ProxyPoolsPage /></Shell>} />
            <Route path="/dashboard/quota" element={<Shell><QuotaPage /></Shell>} />
            <Route path="/dashboard/settings" element={<Shell><SettingsPage /></Shell>} />
            <Route path="/dashboard/settings/pricing" element={<Shell><PricingSettingsPage /></Shell>} />
            <Route path="/dashboard/usage" element={<Shell><UsagePage /></Shell>} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </RuntimeI18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
