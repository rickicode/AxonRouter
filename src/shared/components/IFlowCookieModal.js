"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input } from "@/shared/components";

/**
 * iFlow Cookie Authentication Modal
 * User pastes browser cookie to get fresh API key
 */
export default function IFlowCookieModal({ isOpen, onSuccess, onClose }) {
 const [cookie, setCookie] = useState("");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState(null);
 const [success, setSuccess] = useState(false);

 const handleSubmit = async () => {
 if (!cookie.trim()) {
 setError("Please paste your cookie");
 return;
 }

 setLoading(true);
 setError(null);

 try {
 const res = await fetch("/api/oauth/iflow/cookie", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ cookie: cookie.trim() }),
 });

 const data = await res.json();

 if (!res.ok) {
 throw new Error(data.error || "Authentication failed");
 }

 setSuccess(true);
 setTimeout(() => {
 onSuccess?.();
 handleClose();
 }, 1500);
 } catch (err) {
 setError(err.message);
 } finally {
 setLoading(false);
 }
 };

 const handleClose = () => {
 setCookie("");
 setError(null);
 setSuccess(false);
 onClose?.();
 };

 return (
 <Modal isOpen={isOpen} onClose={handleClose} title="iFlow Cookie Authentication">
 <div className="space-y-3">
 {success ? (
 <div className="text-center py-3">
 <div className="text-6xl mb-3">✅</div>
 <p className="text-lg font-medium text-text-main">Authentication Successful!</p>
 <p className="text-sm text-text-muted mt-2">Fresh API key obtained</p>
 </div>
 ) : (
 <>
 <div className="space-y-3">
 <p className="text-sm text-text-muted">
 To get a fresh API key, paste your browser cookie from{" "}
 <a
 href="https://platform.iflow.cn"
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline"
 >
 platform.iflow.cn
 </a>
 </p>
 <div className="bg-surface-secondary p-3 rounded-sm text-xs space-y-3">
 <p className="font-medium text-text-main">How to get cookie:</p>
 <ol className="list-decimal list-inside space-y-3 text-text-muted">
 <li>Open platform.iflow.cn in your browser</li>
 <li>Login to your account</li>
 <li>Open DevTools (F12) → Application/Storage → Cookies</li>
 <li>Copy the entire cookie string (must include BXAuth)</li>
 <li>Paste it below</li>
 </ol>
 </div>
 </div>

 <div className="space-y-3">
 <label className="block font-medium text-xs text-text-muted">
 Cookie String
 </label>
 <textarea
 value={cookie}
 onChange={(e) => setCookie(e.target.value)}
 placeholder="BXAuth=xxx; ..."
 className="w-full px-3 h-8 bg-surface-secondary border border-border rounded-sm text-sm text-text-main placeholder-text-muted focus:outline-none resize-none"
 rows={4}
 disabled={loading}
 />
 </div>

 {error && (
 <div className="p-3 bg-danger/10 border border-danger/30 rounded-sm">
 <p className="text-sm text-danger">{error}</p>
 </div>
 )}

 <div className="flex gap-3 pt-2">
 <Button variant="secondary" onClick={handleClose} disabled={loading} fullWidth>
 Cancel
 </Button>
 <Button onClick={handleSubmit} loading={loading} fullWidth>
 Authenticate
 </Button>
 </div>
 </>
 )}
 </div>
 </Modal>
 );
}

IFlowCookieModal.propTypes = {
 isOpen: PropTypes.bool.isRequired,
 onSuccess: PropTypes.func,
 onClose: PropTypes.func,
};
