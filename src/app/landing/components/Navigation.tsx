"use client";

import { Menu, Sparkles, SquareArrowOutUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "https://github.com/rickicode/axonrouter#readme", label: "Docs", external: true },
  { href: "https://github.com/rickicode/axonrouter", label: "GitHub", external: true, icon: true },
];

export default function Navigation() {
  const router = useRouter();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 px-4 pt-5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full border border-white/10 bg-[#181411]/78 px-3 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-2xl md:px-5">
        <button
          type="button"
          className="group flex items-center gap-3 rounded-full p-1 pr-3 text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/5"
          onClick={() => router.push("/")}
          aria-label="Navigate to home"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-[#f97815] text-[#181411] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]">
            <Sparkles />
          </span>
          <span className="text-lg font-black tracking-[-0.04em]">AxonRouter</span>
        </button>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              className="flex items-center gap-1 text-sm font-semibold text-white/62 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white"
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
            >
              {link.label}
              {link.icon && <SquareArrowOutUpRight data-icon="inline-end" />}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => router.push("/app")}
            className="hidden rounded-full bg-[#f97815] px-5 font-bold text-[#181411] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#ff8d38] sm:flex"
          >
            Get Started
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 md:hidden">
                <Menu />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[#181411]/95 text-white backdrop-blur-2xl">
              <SheetHeader>
                <SheetTitle className="text-white">AxonRouter</SheetTitle>
                <SheetDescription className="text-white/60">Gateway navigation</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-4">
                {links.map((link) => (
                  <a
                    key={link.href}
                    className="rounded-2xl px-4 py-3 text-sm font-semibold text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                  >
                    {link.label}
                  </a>
                ))}
                <Button
                  onClick={() => router.push("/app")}
                  className="mt-2 rounded-full bg-[#f97815] font-bold text-[#181411] hover:bg-[#ff8d38]"
                >
                  Get Started
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
