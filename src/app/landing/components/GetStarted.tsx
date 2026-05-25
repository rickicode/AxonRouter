"use client";

import { translate } from "@/i18n/runtime";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

export default function GetStarted() {
  return (
    <section className="py-24 px-6 bg-[var(--color-surface)]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          {/* Left: Steps */}
          <div className="flex-1">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text-main)]">{translate("Get Started in 30 Seconds")}</h2>
            <p className="text-[var(--color-text-muted)] text-lg mb-8">
              {translate("Install AxonRouter, configure your providers via web dashboard, and start routing AI requests.")}
            </p>
            
            <div className="flex flex-col gap-5">
              <div className="flex gap-4">
                <div className="flex-none w-8 h-8 rounded bg-[var(--color-primary)]/10 text-[var(--color-accent)] flex items-center justify-center font-semibold text-sm">1</div>
                <div>
                  <h4 className="font-semibold text-[15px] text-[var(--color-text-main)]">{translate("Install AxonRouter")}</h4>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">{translate("Run npx command to start the server instantly")}</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-none w-8 h-8 rounded bg-[var(--color-primary)]/10 text-[var(--color-accent)] flex items-center justify-center font-semibold text-sm">2</div>
                <div>
                  <h4 className="font-semibold text-[15px] text-[var(--color-text-main)]">{translate("Open Dashboard")}</h4>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">{translate("Configure providers and API keys via web interface")}</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-none w-8 h-8 rounded bg-[var(--color-primary)]/10 text-[var(--color-accent)] flex items-center justify-center font-semibold text-sm">3</div>
                <div>
                  <h4 className="font-semibold text-[15px] text-[var(--color-text-main)]">{translate("Route Requests")}</h4>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">{translate("Point your CLI tools to")} {DEFAULT_AXONROUTER_BASE_URL}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Code block */}
          <div className="flex-1 w-full">
            <div className="rounded overflow-hidden bg-zinc-900 border border-[var(--color-border)]">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800/50 border-b border-[var(--color-border)]">
                <div className="w-3 h-3 rounded bg-[var(--color-danger)]/80"></div>
                <div className="w-3 h-3 rounded bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded bg-green-500/80"></div>
                <div className="ml-2 text-xs text-[var(--color-text-muted)] font-mono">bash</div>
              </div>
              
              {/* Terminal content */}
              <div className="p-5 font-mono text-sm leading-relaxed overflow-x-auto">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[var(--color-success)]">$</span>
                  <span className="text-zinc-200">npx axonrouter</span>
                </div>
                
                <div className="text-[var(--color-text-muted)] mb-5 space-y-1">
                  <div><span className="text-[var(--color-accent)]">&gt;</span> {translate("Starting AxonRouter...")}</div>
                  <div><span className="text-[var(--color-accent)]">&gt;</span> {translate("Server running on")} <span className="text-sky-400">{DEFAULT_AXONROUTER_BASE_URL}</span></div>
                  <div><span className="text-[var(--color-accent)]">&gt;</span> {translate("Dashboard:")} <span className="text-sky-400">{DEFAULT_AXONROUTER_BASE_URL}/dashboard</span></div>
                  <div><span className="text-[var(--color-success)]">&gt;</span> {translate("Ready to route!")}</div>
                </div>
                
                <div className="text-xs text-[var(--color-text-muted)] mb-3 border-t border-zinc-700/50 pt-4">
                  {translate("Configure providers in dashboard or use environment variables")}
                </div>
                
                <div className="text-[var(--color-text-muted)] text-xs space-y-0.5">
                  <div><span className="text-violet-400">{translate("Data Location:")}</span></div>
                  <div>  macOS/Linux: ~/.axonrouter/db.sqlite</div>
                  <div>  Windows: %APPDATA%/axonrouter/db.sqlite</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
