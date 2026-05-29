"use client";

import AppIcon from "@/shared/components/AppIcon";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useNotificationStore } from "@/store/notificationStore";
import { cn } from "@/lib/utils";
import Sidebar from "../Sidebar";
import Header from "../Header";
import type { ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

function getToastStyle(type: ToastType) {
  if (type === "success") return { wrapper: "text-[color:var(--color-success)]", icon: "check_circle" };
  if (type === "error") return { wrapper: "text-destructive", icon: "error" };
  if (type === "warning") return { wrapper: "text-[color:var(--color-warning)]", icon: "warning" };
  return { wrapper: "text-[color:var(--color-info)]", icon: "info" };
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  const basicChat = pathname === "/app/basic-chat";

  return (
    <SidebarProvider className="rr-dark-shell" style={{ "--sidebar-width": "18rem" } as React.CSSProperties}>
      <TooltipProvider>
        <div className="fixed right-5 top-5 z-80 flex w-[min(92vw,400px)] flex-col gap-3">
          {notifications.map((n) => {
            const style = getToastStyle(n.type);
            return (
              <Alert key={n.id} className="flex items-start gap-3 bg-card/95 text-card-foreground shadow-2xl shadow-black/30">
                <div className={style.wrapper}>
                  <AppIcon name={style.icon} />
                </div>
                <div className="min-w-0 flex-1">
                  {n.title ? <AlertTitle>{n.title}</AlertTitle> : null}
                  <AlertDescription>{n.message}</AlertDescription>
                </div>
                {n.dismissible ? (
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeNotification(n.id)} aria-label="Dismiss notification">
                    <AppIcon name="close" />
                  </Button>
                ) : null}
              </Alert>
            );
          })}
        </div>

        <Sidebar />

        <SidebarInset className="min-h-svh bg-transparent">
          <Header trigger={<SidebarTrigger aria-label="Open navigation" />} />
          <main className={cn("rr-main-scroll", basicChat && "rr-main-scroll--basic-chat")}>
            <div className={cn("rr-main-inner", basicChat && "rr-main-inner--basic-chat")}>{children}</div>
          </main>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}
