"use client";

import { useState, useEffect } from "react";
import { getDefaultPricing, formatCost } from "open-sse/providers/pricing.js";

export default function PricingModal({ isOpen, onClose, onSave }) {
 const [pricingData, setPricingData] = useState({});
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const loadPricing = async () => {
 setLoading(true);
 try {
 const response = await fetch("/api/pricing");
 if (response.ok) {
 const data = await response.json();
 setPricingData(data);
 } else {
 // Fallback to defaults
 const defaults = getDefaultPricing();
 setPricingData(defaults);
 }
 } catch (error) {
 console.error("Failed to load pricing:", error);
 const defaults = getDefaultPricing();
 setPricingData(defaults);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 if (isOpen) {
 queueMicrotask(() => loadPricing());
 }
 }, [isOpen]);

 const handlePricingChange = (provider, model, field, value) => {
 const numValue = parseFloat(value);
 if (isNaN(numValue) || numValue < 0) return;

 setPricingData(prev => {
 const newData = { ...prev };
 if (!newData[provider]) newData[provider] = {};
 if (!newData[provider][model]) newData[provider][model] = {};
 newData[provider][model][field] = numValue;
 return newData;
 });
 };

 const handleSave = async () => {
 setSaving(true);
 try {
 const response = await fetch("/api/pricing", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(pricingData)
 });

 if (response.ok) {
 onSave?.();
 onClose();
 } else {
 const error = await response.json();
 alert(`Failed to save pricing: ${error.error}`);
 }
 } catch (error) {
 console.error("Failed to save pricing:", error);
 alert("Failed to save pricing");
 } finally {
 setSaving(false);
 }
 };

 const handleReset = async () => {
 if (!confirm("Reset all pricing to defaults? This cannot be undone.")) return;

 try {
 const response = await fetch("/api/pricing", { method: "DELETE" });
 if (response.ok) {
 const defaults = getDefaultPricing();
 setPricingData(defaults);
 }
 } catch (error) {
 console.error("Failed to reset pricing:", error);
 alert("Failed to reset pricing");
 }
 };

 if (!isOpen) return null;

 // Get all unique providers and models for display
 const allProviders = Object.keys(pricingData).sort();
 const pricingFields = ["input", "output", "cached", "reasoning", "cache_creation"];

 return (
 <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-3">
 <div className="bg-surface border border-border rounded-sm max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
 {/* Header */}
 <div className="p-3 border-b border-border flex items-center justify-between h-8">
 <h2 className="text-sm font-semibold">Pricing Configuration</h2>
 <button
 onClick={onClose}
 className="text-text-muted hover:text-text text-2xl"
 >
 ×
 </button>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-auto p-3">
 {loading ? (
 <div className="text-center py-3 text-text-muted">Loading pricing data...</div>
 ) : (
 <div className="space-y-3">
 {/* Instructions */}
 <div className="bg-surface-2 border border-border rounded-sm p-3 text-sm">
 <p className="font-medium mb-1">Pricing Rates Format</p>
 <p className="text-text-muted">
 All rates are in <strong>dollars per million tokens</strong> ($/1M tokens).
 Example: Input rate of 2.50 means $2.50 per 1,000,000 input tokens.
 </p>
 </div>

 {/* Pricing Tables */}
 {allProviders.map(provider => {
 const models = Object.keys(pricingData[provider]).sort();
 return (
 <div key={provider} className="border border-border rounded-sm overflow-hidden">
 <div className="bg-surface-2 px-3 h-8 font-semibold text-sm">
 {provider.toUpperCase()}
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-surface-2 text-text-muted text-xs">
 <tr>
 <th className="px-3 h-8 text-left text-xs font-medium text-text-muted">Model</th>
 <th className="px-3 h-8 text-right text-xs font-medium text-text-muted">Input</th>
 <th className="px-3 h-8 text-right text-xs font-medium text-text-muted">Output</th>
 <th className="px-3 h-8 text-right text-xs font-medium text-text-muted">Cached</th>
 <th className="px-3 h-8 text-right text-xs font-medium text-text-muted">Reasoning</th>
 <th className="px-3 h-8 text-right text-xs font-medium text-text-muted">Cache Creation</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {models.map(model => (
 <tr key={model} className="hover:bg-surface-2">
 <td className="px-3 h-8 font-medium text-sm">{model}</td>
 {pricingFields.map(field => (
 <td key={field} className="px-3 h-8 text-sm">
 <input
 type="number"
 step="0.01"
 min="0"
 value={pricingData[provider][model][field] || 0}
 onChange={(e) => handlePricingChange(provider, model, field, e.target.value)}
 className="w-20 px-2 py-1 text-right bg-surface border border-border rounded-sm focus:outline-none focus:border-primary"
 />
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 );
 })}

 {allProviders.length === 0 && (
 <div className="text-center py-3 text-text-muted">
 No pricing data available
 </div>
 )}
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="p-3 border-t border-border flex items-center justify-between gap-2 h-8">
 <button
 onClick={handleReset}
 className="px-3 h-8 text-sm text-danger hover:bg-danger/10 rounded-sm border border-danger/30"
 disabled={saving}
 >
 Reset to Defaults
 </button>
 <div className="flex gap-2">
 <button
 onClick={onClose}
 className="px-3 h-8 text-sm text-text-muted hover:text-text border border-border rounded-sm"
 disabled={saving}
 >
 Cancel
 </button>
 <button
 onClick={handleSave}
 className="px-3 h-8 text-sm bg-primary text-white rounded-sm hover:bg-primary/90 disabled:opacity-50"
 disabled={saving}
 >
 {saving ? "Saving..." : "Save Changes"}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}