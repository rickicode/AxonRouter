"use client";

import { useState } from "react";
import { Power, PowerOff } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { translate } from "@/i18n/runtime";

type SidebarShutdownControlProps = {
  variant?: "sidebar" | "menu";
};

export default function SidebarShutdownControl({ variant = "sidebar" }: SidebarShutdownControlProps) {
  const [showModal, setShowModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/shutdown", { method: "POST" });
    } catch {
      // The request commonly aborts because the server exits.
    }
    setIsShuttingDown(false);
    setShowModal(false);
    setIsDisconnected(true);
  };

  return (
    <>
      {variant === "menu" ? (
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setShowModal(true); }} className="text-destructive focus:text-destructive">
          <Power size={14} strokeWidth={2} />
          <span>Shutdown server</span>
        </DropdownMenuItem>
      ) : (
        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-2 rounded-sm border border-sidebar-border bg-sidebar-accent/35 px-2.5 py-2 text-xs text-muted-foreground hover:border-destructive/35 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowModal(true)}
        >
          <Power size={14} strokeWidth={2} />
          <span className="truncate">Shutdown server</span>
        </Button>
      )}
      <AlertDialog open={showModal} onOpenChange={setShowModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/15 text-destructive"><Power size={20} strokeWidth={2} /></AlertDialogMedia>
            <AlertDialogTitle>Close Proxy</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to close the proxy server?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isShuttingDown}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isShuttingDown} onClick={handleShutdown}>{isShuttingDown ? <Spinner /> : null}Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isDisconnected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur">
          <Card className="w-full max-w-sm text-center">
            <CardHeader className="items-center border-b-0 pb-0">
              <div className="flex size-16 items-center justify-center rounded-full bg-destructive/20 text-destructive"><PowerOff size={32} strokeWidth={2} /></div>
              <div>
                <CardTitle>{translate("Server Disconnected")}</CardTitle>
                <CardDescription>{translate("The proxy server has been stopped.")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent><Button variant="secondary" onClick={() => globalThis.location.reload()}>{translate("Reload Page")}</Button></CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
