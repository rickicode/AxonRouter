"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import AppIcon from "@/shared/components/AppIcon";
import { translate } from "@/i18n/runtime";

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--color-primary-soft),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:24px_24px]" />
      <div className="relative w-full max-w-lg rounded-[4px] border border-border bg-foreground/[0.025] p-2 shadow-[var(--shadow-shell)]">
        <Card className="rounded-[4px] bg-card/95 shadow-none ring-border/80">
          {children}
        </Card>
      </div>
    </main>
  );
}

function CallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("processing");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    const callbackData = {
      code,
      state,
      error,
      errorDescription,
      fullUrl: window.location.href,
    };

    if (window.opener) {
      try {
        window.opener.postMessage({ type: "oauth_callback", data: callbackData }, "*");
      } catch (e) {
        console.log("postMessage failed:", e);
      }
    }

    try {
      const channel = new BroadcastChannel("oauth_callback");
      channel.postMessage(callbackData);
      channel.close();
    } catch (e) {
      console.log("BroadcastChannel failed:", e);
    }

    try {
      localStorage.setItem("oauth_callback", JSON.stringify({ ...callbackData, timestamp: Date.now() }));
    } catch (e) {
      console.log("localStorage failed:", e);
    }

    if (!(code || error)) {
      const manualTimer = setTimeout(() => setStatus("manual"), 0);
      return () => clearTimeout(manualTimer);
    }

    const successTimer = setTimeout(() => {
      setStatus("success");
      const closeTimer = setTimeout(() => {
        window.close();
        setTimeout(() => setStatus("done"), 500);
      }, 1500);
      return () => clearTimeout(closeTimer);
    }, 0);

    return () => {
      clearTimeout(successTimer);
    };
  }, [searchParams]);

  return (
    <StatusShell>
      <CardHeader className="items-center px-8 pt-10 text-center">
        {status === "processing" && (
          <div className="mb-2 flex size-16 items-center justify-center rounded-[4px] bg-primary/10 text-primary">
            <Spinner className="size-8" />
          </div>
        )}
        {(status === "success" || status === "done") && (
          <div className="mb-2 flex size-16 items-center justify-center rounded-[4px] bg-[var(--color-success)]/15 text-[var(--color-success)]">
            <AppIcon name="check_circle" />
          </div>
        )}
        {status === "manual" && (
          <div className="mb-2 flex size-16 items-center justify-center rounded-[4px] bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
            <AppIcon name="info" />
          </div>
        )}
        <CardTitle className="text-2xl font-extrabold tracking-[-0.04em]">
          {status === "processing" && translate("Processing...")}
          {status === "success" && translate("Authorization Successful!")}
          {status === "done" && translate("Authorization Successful!")}
          {status === "manual" && translate("Copy This URL")}
        </CardTitle>
        <CardDescription>
          {status === "processing" && translate("Please wait while we complete the authorization.")}
          {status === "success" && translate("This window will close automatically...")}
          {status === "done" && translate("You can close this tab now.")}
          {status === "manual" && translate("Please copy the URL from the address bar and paste it in the application.")}
        </CardDescription>
      </CardHeader>
      {status === "manual" && (
        <CardContent className="px-8 pb-8">
          <Alert className="rounded-[4px] border-0 text-[var(--color-primary)] !bg-[var(--color-primary)]/15">
            <AlertTitle>Callback URL</AlertTitle>
            <AlertDescription>
              <code className="mt-2 block break-all rounded-[4px] bg-muted px-3 py-2 text-xs text-foreground">
                {typeof window !== "undefined" ? window.location.href : ""}
              </code>
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
    </StatusShell>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <StatusShell>
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Spinner className="size-8 text-primary" />
            <p className="text-sm text-muted-foreground">{translate("Loading...")}</p>
          </CardContent>
        </StatusShell>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
