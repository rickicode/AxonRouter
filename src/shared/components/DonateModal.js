"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { GITHUB_CONFIG } from "@/shared/constants/config";
import Icon from "@/shared/components/Icon";

export default function DonateModal({ isOpen, onClose }) {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const modalRef = useRef(null);

 useEffect(() => {
 if (!isOpen || data) return;
 let cancelled = false;
 queueMicrotask(() => {
 if (cancelled) return;
 setLoading(true);
 setError("");
 });
 fetch(GITHUB_CONFIG.donateUrl, { cache: "no-store" })
 .then((res) => {
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 return res.json();
 })
 .then((json) => setData(json))
 .catch((err) => setError(err.message || "Failed to load"))
 .finally(() => setLoading(false));
 }, [isOpen, data]);

 useEffect(() => {
 const handleClickOutside = (e) => {
 if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
 };
 if (isOpen) {
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }
 }, [isOpen, onClose]);

 if (!isOpen || typeof document === "undefined") return null;

 return createPortal(
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
 <div className="absolute inset-0 bg-black/80" onClick={onClose} />
 <div
 ref={modalRef}
 className="relative w-full bg-surface border border-border rounded-sm animate-in fade-in zoom-in-95 max-w-3xl flex flex-col max-h-[85vh]"
 >
 <div className="flex items-center justify-between p-3 border-b border-border h-8">
 <h2 className="text-sm font-semibold text-text-main flex items-center gap-2">
 <Icon className="text-primary" name="volunteer_activism" size={18} />
 {data?.title || "Support AxonRouter"}
 </h2>
 <button
 onClick={onClose}
 className="p-1.5 rounded-sm text-text-muted hover:bg-surface-2"
 aria-label="Close"
 >
 <Icon name="close" size={18} />
 </button>
 </div>

 <div className="p-3 overflow-y-auto flex-1">
 {loading && (
 <div className="flex items-center justify-center py-3 text-text-muted">
 <Icon className="animate-spin mr-2" name="progress_activity" size={18} />
 Loading...
 </div>
 )}
 {error && (
 <div className="text-danger py-3">Failed to load donate info: {error}</div>
 )}
 {!loading && !error && data && (
 <>
 {data.message && (
 <p className="text-text-muted text-sm mb-3 text-center">{data.message}</p>
 )}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 {data.channels?.map((ch) => (
 <DonateChannelCard key={ch.id} channel={ch} />
 ))}
 </div>
 </>
 )}
 </div>
 </div>
 </div>,
 document.body
 );
}

function DonateChannelCard({ channel }) {
 const { label, description, icon, color, url, qr } = channel;
 const content = (
 <>
 <div
 className="w-12 h-12 rounded-sm flex items-center justify-center mb-3"
 style={{ backgroundColor: `${color}20`, color }}
 >
<Icon name={icon} size={26} />
 </div>
 <div className="font-medium text-text-main mb-1">{label}</div>
 {description && (
 <div className="text-xs text-text-muted mb-3 text-center">{description}</div>
 )}
 {qr && (
 <img
 src={qr}
 alt={`${label} QR`}
 className="w-full max-w-[180px] aspect-square object-contain rounded-sm bg-surface p-1"
 loading="lazy"
 decoding="async"
 />
 )}
 </>
 );

 return (
 <div className="flex flex-col items-center p-3 rounded-sm border border-border bg-surface/50 hover:border-primary/30">
 {content}
 {url && (
 <a
 href={url}
 target="_blank"
 rel="noopener noreferrer"
 className="mt-3 inline-flex items-center gap-1 px-3 py-2 rounded-sm text-sm font-medium text-white hover:opacity-90 transition-opacity"
 style={{ backgroundColor: color }}
 >
 Open
 <Icon name="open_in_new" size={18} />
 </a>
 )}
 </div>
 );
}

DonateModal.propTypes = {
 isOpen: PropTypes.bool.isRequired,
 onClose: PropTypes.func.isRequired,
};
