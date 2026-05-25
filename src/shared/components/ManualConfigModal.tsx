"use client";

import { useState } from "react";
import AppIcon from "./AppIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

export default function ManualConfigModal({ isOpen, onClose, title = "Manual Configuration", configs = [] }) {
  const { copy } = useCopyToClipboard();
  const [copiedIndex, setCopiedIndex] = useState(null);

  const copyConfig = (text, index) => {
    copy(text, `manualconfig-${index}`);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
        {configs.map((config, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-main)]">{config.filename}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyConfig(config.content, index)}
              >
                <AppIcon
                  name={copiedIndex === index ? "check" : "content_copy"}
                  size={14}
                />
                {copiedIndex === index ? "Copied!" : "Copy"}
              </Button>
            </div>
            <pre className="max-h-60 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-2 font-mono text-xs text-[var(--color-text-main)]">
              {config.content}
            </pre>
          </div>
        ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
