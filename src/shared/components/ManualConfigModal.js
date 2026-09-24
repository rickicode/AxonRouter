"use client";

import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Icon from "@/shared/components/Icon";

export default function ManualConfigModal({ isOpen, onClose, title = "Manual Configuration", configs = [] }) {
 const { copy } = useCopyToClipboard();
 const [copiedIndex, setCopiedIndex] = useState(null);

 const copyConfig = (text, index) => {
 copy(text, `manualconfig-${index}`);
 setCopiedIndex(index);
 setTimeout(() => setCopiedIndex(null), 2000);
 };

 return (
 <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
 <div className="flex flex-col gap-3">
 {configs.map((config, index) => (
 <div key={index} className="flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-text-main">{config.filename}</span>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => copyConfig(config.content, index)}
 >
<Icon name={copiedIndex === index ? "check" : "content_copy"} size={18} className="mr-1" />
 {copiedIndex === index ? "Copied!" : "Copy"}
 </Button>
 </div>
<pre className="bg-surface rounded-sm font-mono text-xs whitespace-pre-wrap break-all max-h-60 overflow-y-auto border border-border p-3 text-text-main">
 {config.content}
 </pre>
 </div>
 ))}
 </div>
 </Modal>
 );
}
