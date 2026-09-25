import "@fontsource-variable/inter";
import "@/app/globals.css";
import { StrictMode, useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";
import { DashboardLayout, ErrorBoundary } from "@/shared/components";

const LoginPage = lazy(() => import("@/app/login/page.js"));
const LandingPage = lazy(() => import("@/app/landing/page.js"));
const CallbackPage = lazy(() => import("@/app/callback/page.js"));

const AppPageClient = lazy(() => import("@/app/(dashboard)/dashboard/app/AppPageClient.js"));
const BenchmarkPage = lazy(() => import("@/app/(dashboard)/dashboard/benchmark/page.js"));
const CLIToolsPageClient = lazy(() => import("@/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js"));
const ToolDetailClient = lazy(() => import("@/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js"));
const CombosPage = lazy(() => import("@/app/(dashboard)/dashboard/combos/page.js"));
const ConsoleLogPage = lazy(() => import("@/app/(dashboard)/dashboard/console-log/page.js"));
const MediaKindPage = lazy(() => import("@/app/(dashboard)/dashboard/media-providers/[kind]/page.js"));
const MediaKindIdPage = lazy(() => import("@/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page.js"));
const MediaComboPage = lazy(() => import("@/app/(dashboard)/dashboard/media-providers/combo/[...id]/page.js"));
const MediaWebPage = lazy(() => import("@/app/(dashboard)/dashboard/media-providers/web/page.js"));
const ProvidersPage = lazy(() => import("@/app/(dashboard)/dashboard/providers/page.js"));
const ProviderNewPage = lazy(() => import("@/app/(dashboard)/dashboard/providers/new/page.js"));
const ProviderDetailPage = lazy(() => import("@/app/(dashboard)/dashboard/providers/[id]/page.js"));
const ProxyPoolsPage = lazy(() => import("@/app/(dashboard)/dashboard/proxy-pools/page.js"));
const QuotaPage = lazy(() => import("@/app/(dashboard)/dashboard/quota/page.js"));
const SettingsPage = lazy(() => import("@/app/(dashboard)/dashboard/settings/page.js"));
const PricingSettingsPage = lazy(() => import("@/app/(dashboard)/dashboard/settings/pricing/page.js"));
const UsagePage = lazy(() => import("@/app/(dashboard)/dashboard/usage/page.js"));

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

function AuthGuard({ children }) {
  const [authState, setAuthState] = useState({ checking: true, allowed: false });

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (!data || data.requireLogin === false || data.authenticated === true) {
          setAuthState({ checking: false, allowed: true });
        } else {
          setAuthState({ checking: false, allowed: false });
        }
      })
      .catch(() => {
        if (alive) setAuthState({ checking: false, allowed: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (authState.checking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!authState.allowed) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PageSpinner() {
  return (
    <div className="flex h-64 w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function Shell({ children }) {
  return (
    <AuthGuard>
      <DashboardLayout>
        <ErrorBoundary>
          <Suspense fallback={<PageSpinner />}>{children}</Suspense>
        </ErrorBoundary>
      </DashboardLayout>
    </AuthGuard>
  );
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
            <Route path="/login" element={<Suspense fallback={<PageSpinner />}><LoginPage /></Suspense>} />
            <Route path="/landing" element={<Suspense fallback={<PageSpinner />}><LandingPage /></Suspense>} />
            <Route path="/callback" element={<Suspense fallback={<PageSpinner />}><CallbackPage /></Suspense>} />

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
