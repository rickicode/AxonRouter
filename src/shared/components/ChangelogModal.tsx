"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { marked } from "marked";
import { GITHUB_CONFIG } from "@/shared/constants/config";
import { translate } from "@/i18n/runtime";

marked.setOptions({ gfm: true, breaks: true });

export default function ChangelogModal({ isOpen, onClose }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen || html) return undefined;

    let cancelled = false;

    void (async () => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }

      try {
        const res = await fetch(GITHUB_CONFIG.changelogUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const md = await res.text();
        const parsedHtml = await marked.parse(md);
        if (!cancelled) setHtml(parsedHtml);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, html]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 [background-color:var(--color-overlay,rgba(0,0,0,0.48))]"
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        ref={modalRef}
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded border border-[var(--color-border)] bg-[var(--color-surface)] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
          <h2 className="text-lg font-semibold text-[var(--color-text-main)]">{translate("Change Log")}</h2>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-text-main)]"
            aria-label={translate("Close")}
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)]">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" strokeWidth={2} />
              {translate("Loading...")}
            </div>
          )}
          {error && (
            <div className="py-4 text-[var(--color-danger)]">{translate("Failed to load changelog:")} {error}</div>
          )}
          {!loading && !error && html && (
            <div
              className="changelog-body text-[var(--color-text-main)]"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

ChangelogModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
