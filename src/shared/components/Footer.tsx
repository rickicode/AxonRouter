"use client";

import Link from "next/link";
import { GitBranch, Sparkles, X } from "lucide-react";
import { APP_CONFIG } from "@/shared/constants/config";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Changelog", href: "#" },
  ],
  resources: [
    { label: "Documentation", href: "#" },
    { label: "API Reference", href: "#" },
    { label: "Help Center", href: "#" },
  ],
  company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Contact", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-[var(--color-bg)] border-t border-[var(--color-border)] pt-16 pb-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="size-6 text-[var(--color-primary)]">
                <Sparkles className="w-full h-full" strokeWidth={2} />
              </div>
              <span className="text-xl font-bold text-[var(--color-text-main)]">
                {APP_CONFIG.name}
              </span>
            </div>
            <p className="text-[var(--color-text-muted)] mb-6 max-w-sm font-light">
              The unified interface for modern AI infrastructure. Secure, observable, and scalable.
            </p>
            {/* Social links */}
            <div className="flex gap-4">
              <a
                href="#"
                className="text-gray-400 hover:text-[var(--color-primary)] transition-colors"
                aria-label="Twitter"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </a>
              <a
                href="#"
                className="text-gray-400 hover:text-[var(--color-primary)] transition-colors"
                aria-label="GitHub"
              >
                <GitBranch className="w-5 h-5" strokeWidth={2} />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-[var(--color-text-main)] mb-4">Product</h4>
            <ul className="flex flex-col gap-3 text-sm text-[var(--color-text-muted)] font-light">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-[var(--color-primary)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-[var(--color-text-main)] mb-4">Resources</h4>
            <ul className="flex flex-col gap-3 text-sm text-[var(--color-text-muted)] font-light">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-[var(--color-primary)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-[var(--color-text-main)] mb-4">Company</h4>
            <ul className="flex flex-col gap-3 text-sm text-[var(--color-text-muted)] font-light">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-[var(--color-primary)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-[var(--color-border)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            © {new Date().getFullYear()} {APP_CONFIG.name} Inc. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-[var(--color-text-muted)]">
            <Link href="#" className="hover:text-[var(--color-primary)] transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-[var(--color-primary)] transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

