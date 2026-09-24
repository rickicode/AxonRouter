"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { marked } from "marked";
import { GITHUB_CONFIG } from "@/shared/constants/config";
import Icon from "@/shared/components/Icon";

marked.setOptions({ gfm: true, breaks: true });

export default function ChangelogModal({ isOpen, onClose }) {
 const [html, setHtml] = useState("");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const modalRef = useRef(null);

 useEffect(() => {
 if (!isOpen || html) return;
 let cancelled = false;
 queueMicrotask(() => {
 if (cancelled) return;
 setLoading(true);
 setError("");
 });
 fetch(GITHUB_CONFIG.changelogUrl)
 .then((res) => {
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 return res.text();
 })
 .then((md) => setHtml(marked.parse(md)))
 .catch((err) => setError(err.message || "Failed to load"))
 .finally(() => setLoading(false));
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
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
 {/* Overlay */}
 <div
 className="absolute inset-0 bg-black/80"
 onClick={onClose}
 />

 {/* Modal content */}
 <div
 ref={modalRef}
 className="relative w-full bg-surface border border-border rounded-sm animate-in fade-in zoom-in-95 max-w-3xl flex flex-col max-h-[85vh]"
 >
 {/* Header */}
 <div className="flex items-center justify-between p-3 border-b border-border h-8">
 <h2 className="text-sm font-semibold text-text-main">Change Log</h2>
 <button
 onClick={onClose}
 className="p-1.5 rounded-sm text-text-muted hover:bg-surface-2"
 aria-label="Close"
 >
 <Icon name="close" size={18} />
 </button>
 </div>

 {/* Body */}
 <div className="p-3 overflow-y-auto flex-1">
 {loading && (
 <div className="flex items-center justify-center py-3 text-text-muted">
 <Icon className="animate-spin mr-2" name="progress_activity" size={18} />
 Loading...
 </div>
 )}
 {error && (
 <div className="text-danger py-3">Failed to load changelog: {error}</div>
 )}
 {!loading && !error && html && (
 <div
 className="changelog-body text-text-main"
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
