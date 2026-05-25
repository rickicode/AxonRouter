"use client";

import { Boxes, Sparkles, Terminal } from "lucide-react";
import { translate } from "@/i18n/runtime";

export default function HowItWorks() {
  return (
    <section className="py-24 border-y border-[var(--color-border)] bg-[var(--color-bg-alt)]" id="how-it-works">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[var(--color-text-main)]">{translate("How AxonRouter Works")}</h2>
          <p className="text-[var(--color-text-muted)] max-w-xl text-lg">
            {translate("Data flows seamlessly from your application through our intelligent routing layer to the best provider for the job.")}
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connection line */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-[2px] bg-gradient-to-r from-zinc-300 via-[var(--color-primary)] to-zinc-300 -z-10 opacity-30"></div>
          
          {/* Step 1: CLI & SDKs */}
          <div className="flex flex-col gap-6 relative group">
            <div className="w-20 h-20 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mx-auto md:mx-0 group-hover:border-[var(--color-accent)]/30 transition-all">
              <Terminal className="h-8 w-8 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-[var(--color-text-main)]">{translate("1. CLI & SDKs")}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {translate("Your requests start from your favorite tools or our unified SDK. Just change the base URL.")}
              </p>
            </div>
          </div>

          {/* Step 2: AxonRouter Hub */}
          <div className="flex flex-col gap-6 relative group md:items-center md:text-center">
            <div className="w-20 h-20 rounded bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)] flex items-center justify-center z-10 mx-auto">
              <Sparkles className="h-8 w-8 text-[var(--color-accent)]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-[var(--color-accent)]">{translate("2. AxonRouter Hub")}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {translate("Our engine analyzes the prompt, checks provider health, and routes for lowest latency or cost.")}
              </p>
            </div>
          </div>

          {/* Step 3: AI Providers */}
          <div className="flex flex-col gap-6 relative group md:items-end md:text-right">
            <div className="w-20 h-20 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mx-auto md:mx-0 group-hover:border-[var(--color-accent)]/30 transition-all">
              <Boxes className="h-8 w-8 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-[var(--color-text-main)]">{translate("3. AI Providers")}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {translate("The request is fulfilled by OpenAI, Anthropic, Gemini, or others instantly.")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
