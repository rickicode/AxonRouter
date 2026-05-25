"use client";

import { GitBranch, Sparkles } from "lucide-react";
import { translate } from "@/i18n/runtime";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] pt-16 pb-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-16">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-9 h-9 rounded bg-[var(--color-primary)] text-white">
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="text-[var(--color-text-main)] text-lg font-bold">AxonRouter</h3>
            </div>
            <p className="text-[var(--color-text-muted)] text-sm max-w-xs mb-6">
              {translate("The unified endpoint for AI generation. Connect, route, and manage your AI providers with ease.")}
            </p>
            <div className="flex gap-4">
              <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors" href="https://github.com/rickicode/axonrouter" target="_blank" rel="noopener noreferrer">
                <GitBranch className="w-5 h-5" strokeWidth={2} />
              </a>
            </div>
          </div>
          
          {/* Product */}
          <div className="flex flex-col gap-4">
            <h4 className="font-semibold text-[var(--color-text-main)]">{translate("Product")}</h4>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="#features">{translate("Features")}</a>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="/dashboard">{translate("Dashboard")}</a>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://github.com/rickicode/axonrouter/releases" target="_blank" rel="noopener noreferrer">{translate("Changelog")}</a>
          </div>
          
          {/* Resources */}
          <div className="flex flex-col gap-4">
            <h4 className="font-semibold text-[var(--color-text-main)]">{translate("Resources")}</h4>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://github.com/rickicode/axonrouter#readme" target="_blank" rel="noopener noreferrer">{translate("Documentation")}</a>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://github.com/rickicode/axonrouter" target="_blank" rel="noopener noreferrer">{translate("GitHub")}</a>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://www.npmjs.com/package/axonrouter" target="_blank" rel="noopener noreferrer">{translate("NPM")}</a>
          </div>
          
          {/* Legal */}
          <div className="flex flex-col gap-4">
            <h4 className="font-semibold text-[var(--color-text-main)]">{translate("Legal")}</h4>
            <a className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://github.com/rickicode/axonrouter/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">{translate("MIT License")}</a>
          </div>
        </div>
        
        {/* Bottom */}
        <div className="border-t border-[var(--color-border)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[var(--color-text-subtle)] text-sm">{translate("© 2025 AxonRouter. All rights reserved.")}</p>
          <div className="flex gap-6">
            <a className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://github.com/rickicode/axonrouter" target="_blank" rel="noopener noreferrer">{translate("GitHub")}</a>
            <a className="text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] text-sm transition-colors" href="https://www.npmjs.com/package/axonrouter" target="_blank" rel="noopener noreferrer">{translate("NPM")}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
