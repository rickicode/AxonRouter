"use client";

import type { ReactNode } from "react";

import ThemeToggle from "../ThemeToggle";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[var(--color-bg)] transition-colors duration-500 selection:bg-[var(--color-primary)]/20 selection:text-[var(--color-primary)]">
      <div className="pointer-events-none fixed left-1/2 top-1/2 z-0 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary)]/5 blur-[100px]" />
      <div className="pointer-events-none fixed bottom-0 right-0 z-0 h-[600px] w-[600px] translate-x-1/3 translate-y-1/3 rounded-full bg-orange-200/20 blur-[120px] dark:bg-orange-900/10" />

      <div className="absolute right-6 top-6 z-20">
        <ThemeToggle variant="card" />
      </div>

      <main className="z-10 flex h-full w-full flex-1 flex-col items-center justify-center p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}

