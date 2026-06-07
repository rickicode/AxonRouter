"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import AppIcon from "@/shared/components/AppIcon";
import { cn } from "@/lib/utils";

interface VerifyAccountBadgeProps {
  validationUrl: string;
  provider?: string;
  className?: string;
}

export default function VerifyAccountBadge({
  validationUrl,
  provider,
  className,
}: VerifyAccountBadgeProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(validationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  };

  const handleOpen = () => {
    window.open(validationUrl, "_blank", "noopener,noreferrer");
  };

  if (!validationUrl) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border border-amber-500/40 bg-amber-500/12 px-2.5 py-1 text-xs font-bold tracking-[0.01em] text-amber-300 transition-colors hover:bg-amber-500/20",
            className,
          )}
        >
          <AppIcon name="warning" className="size-3.5" />
          Verify Account
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AppIcon name="warning" className="size-5 text-amber-400" />
            Account Verification Required
          </DialogTitle>
          <DialogDescription>
            {provider
              ? `Your ${provider} account needs verification before it can continue to be used.`
              : "Your account needs verification before it can continue to be used."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Verification URL
            </p>
            <p className="break-all font-mono text-xs text-foreground">
              {validationUrl}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Click &quot;Open Verification Page&quot; below to verify your account in a new
            tab, or copy the URL to open it manually.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            <AppIcon name={copied ? "check" : "contentcopy"} className="size-3.5" />
            {copied ? "Copied!" : "Copy URL"}
          </Button>
          <Button variant="default" size="sm" onClick={handleOpen}>
            <AppIcon name="openinnew" className="size-3.5" />
            Open Verification Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
