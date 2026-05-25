"use client";

import { GitBranch, Rocket } from "lucide-react";
import { translate } from "@/i18n/runtime";

export default function HeroSection() {
  return (
    <section className="relative pt-24 pb-20 px-6 min-h-[85vh] flex flex-col items-center justify-center overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-primary)]/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[var(--color-primary)]/8 rounded blur-[120px] pointer-events-none" />
      
      <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center gap-8 animate-fade-in">
        {/* Version badge */}
        <div className="inline-flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 py-1.5 text-sm font-medium text-[var(--color-text-muted)]">
          <span className="flex h-2 w-2 rounded bg-[var(--color-primary)] animate-pulse" />
          {translate("v1.0 now available")}
        </div>

        {/* Main heading */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-[var(--color-text-main)]">
          {translate("One Endpoint for")} {" "}
          <span className="text-[var(--color-accent)]">{translate("All AI Providers")}</span>
        </h1>

        {/* Description */}
        <p className="text-lg md:text-xl text-[var(--color-text-muted)] max-w-2xl mx-auto leading-relaxed">
          {translate("Smart routing between Claude Code, Codex, Gemini CLI, and 40+ providers. Auto fallback, quota tracking, zero downtime.")}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 w-full mt-4">
          <button className="h-11 px-8 rounded bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold transition-all flex items-center gap-2 active:scale-[0.99]">
            <Rocket className="h-5 w-5" strokeWidth={2} />
            {translate("Get Started Free")}
          </button>
          <a 
            href="https://github.com/rickicode/axonrouter" 
            target="_blank" 
            rel="noopener noreferrer"
            className="h-11 px-8 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-bg-alt)] text-[var(--color-text-main)] text-sm font-semibold transition-all flex items-center gap-2"
          >
            <GitBranch className="w-5 h-5" strokeWidth={2} />
            {translate("View on GitHub")}
          </a>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-8 mt-8 pt-8 border-t border-[var(--color-border)]">
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--color-text-main)]">40+</div>
            <div className="text-sm text-[var(--color-text-muted)]">{translate("Providers")}</div>
          </div>
          <div className="w-px h-8 bg-[var(--color-border)]" />
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--color-text-main)]">$0</div>
            <div className="text-sm text-[var(--color-text-muted)]">{translate("Start Free")}</div>
          </div>
          <div className="w-px h-8 bg-[var(--color-border)]" />
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--color-text-main)]">100+</div>
            <div className="text-sm text-[var(--color-text-muted)]">{translate("Models")}</div>          </div>
        </div>
      </div>
    </section>
  );
}
