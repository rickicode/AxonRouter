"use client";

import { memo } from "react";
import PropTypes from "prop-types";
import Link from "@/lib/ui/link.jsx";
import { Card, Badge, Toggle } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { OPENAI_COMPATIBLE_PREFIX, ANTHROPIC_COMPATIBLE_PREFIX } from "@/shared/constants/providers";
import { truncateErrorText } from "../utils";

// ── Card helpers ─────────────────────────────────────────────────

function providerTint(color) {
 if (!color) return undefined;
 if (color.length > 7) return color;
 return `color-mix(in srgb, ${color} 12%, transparent)`;
}

function getStatusDisplay(connected, error, errorCode) {
 const parts = [];
 if (connected > 0) {
 parts.push(
 <Badge key="connected" variant="success" size="sm" dot>
 {connected} Connected
 </Badge>,
 );
 }
 if (error > 0) {
 const errText = errorCode ? `${error} Error (${errorCode})` : `${error} Error`;
 const errLabel = truncateErrorText(errText);
 parts.push(
 <Badge key="error" variant="error" size="sm" dot>
 <span title={errLabel === errText ? undefined : errText}>{errLabel}</span>
 </Badge>,
 );
 }
 if (parts.length === 0) return <span className="text-text-muted">No connections</span>;
 return parts;
}

const cardStatsPropTypes = {
 connected: PropTypes.number,
 error: PropTypes.number,
 total: PropTypes.number,
 errorCode: PropTypes.string,
 errorTime: PropTypes.string,
 allDisabled: PropTypes.bool,
};

// ── BaseProviderCard ─────────────────────────────────────────────

function BaseProviderCard({ providerId, provider, stats, iconSrc, isNoAuth, statusExtra, onToggle, toggleDisabled = false }) {
 const { connected, error, errorCode, errorTime, allDisabled } = stats;
 const toggleLabel = `${allDisabled ? "Enable" : "Disable"} ${provider.name}`;

 return (
 <Link
 href={`/dashboard/providers/${providerId}`}
 className="group min-w-0 rounded-sm focus-visible:outline-none"
 aria-label={`Open ${provider.name} provider details`}
 >
 <Card
 padding="xs"
 className={`h-full hover:bg-surface-2 cursor-pointer ${allDisabled ? "opacity-50" : ""}`}
 >
 <div className="flex min-w-0 items-center justify-between gap-3">
 <div className="flex min-w-0 items-center gap-3">
 <div className="size-8 shrink-0 rounded-sm flex items-center justify-center" style={{ backgroundColor: providerTint(provider.color) }}>
 <ProviderIcon
 src={iconSrc}
 alt={provider.name}
 size={30}
 className="object-contain rounded-sm max-w-[30px] max-h-[30px]"
 fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
 fallbackColor={provider.color}
 />
 </div>
 <div className="min-w-0">
 <h3 className="truncate font-medium">{provider.name}</h3>
 <div className="flex min-w-0 items-center gap-1.5 text-xs flex-wrap">
 {allDisabled ? (
 <Badge variant="default" size="sm">
 <span className="flex items-center gap-1">
 <Icon name="pause_circle" size={18} />
 Disabled
 </span>
 </Badge>
 ) : isNoAuth ? (
 <Badge variant="success" size="sm" dot>Ready</Badge>
 ) : (
 <>
 {getStatusDisplay(connected, error, errorCode)}
 {statusExtra}
 {errorTime && <span className="text-text-muted">{errorTime}</span>}
 </>
 )}
 </div>
 </div>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 {stats.total > 0 && (
 <div
 className="rounded-sm opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
 onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!toggleDisabled) onToggle(!allDisabled ? false : true); }}
 >
 <Toggle
 size="sm"
 checked={!allDisabled}
 disabled={toggleDisabled}
 onChange={() => { if (!toggleDisabled) onToggle(!allDisabled ? false : true); }}
 title={toggleLabel}
 aria-label={toggleLabel}
 />
 </div>
 )}
 </div>
 </div>
 </Card>
 </Link>
 );
}

BaseProviderCard.propTypes = {
 providerId: PropTypes.string.isRequired,
 provider: PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string.isRequired, color: PropTypes.string, textIcon: PropTypes.string }).isRequired,
 stats: PropTypes.shape(cardStatsPropTypes).isRequired,
 iconSrc: PropTypes.string,
 isNoAuth: PropTypes.bool,
 statusExtra: PropTypes.node,
 onToggle: PropTypes.func,
 toggleDisabled: PropTypes.bool,
};

// ── ProviderCard (OAuth/Free) ────────────────────────────────────

function ProviderCard({ providerId, provider, stats, onToggle, toggleDisabled = false }) {
 return (
 <BaseProviderCard
 providerId={providerId}
 provider={provider}
 stats={stats}
 iconSrc={`/providers/${provider.id}.png`}
 isNoAuth={!!provider.noAuth}
 onToggle={onToggle}
 toggleDisabled={toggleDisabled}
 />
 );
}

ProviderCard.propTypes = {
 providerId: PropTypes.string.isRequired,
 provider: PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string.isRequired, color: PropTypes.string, textIcon: PropTypes.string, noAuth: PropTypes.bool }).isRequired,
 stats: PropTypes.shape(cardStatsPropTypes).isRequired,
 authType: PropTypes.string,
 onToggle: PropTypes.func,
 toggleDisabled: PropTypes.bool,
};

// ── ApiKeyProviderCard (API Key + Compatible) ────────────────────

function ApiKeyProviderCard({ providerId, provider, stats, onToggle, toggleDisabled = false }) {
 const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
 const isAnthropicCompatible = providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
 const iconSrc = (() => {
 if (isCompatible && provider.apiType)
 return provider.apiType === "responses" ? "/providers/oai-r.png" : "/providers/oai-cc.png";
 if (isAnthropicCompatible) return "/providers/anthropic-m.png";
 return getProviderIconSrc(provider.id);
 })();
 const statusExtra = (
 <>
 {isCompatible && <Badge variant="default" size="sm">{provider.apiType === "responses" ? "Responses" : "Chat"}</Badge>}
 {isAnthropicCompatible && <Badge variant="default" size="sm">Messages</Badge>}
 </>
 );
 return (
 <BaseProviderCard providerId={providerId} provider={provider} stats={stats} iconSrc={iconSrc} statusExtra={statusExtra} onToggle={onToggle} toggleDisabled={toggleDisabled} />
 );
}

ApiKeyProviderCard.propTypes = {
 providerId: PropTypes.string.isRequired,
 provider: PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string.isRequired, color: PropTypes.string, textIcon: PropTypes.string, apiType: PropTypes.string }).isRequired,
 stats: PropTypes.shape(cardStatsPropTypes).isRequired,
 authType: PropTypes.string,
 onToggle: PropTypes.func,
 toggleDisabled: PropTypes.bool,
};

export { BaseProviderCard, ProviderCard, ApiKeyProviderCard };
export default ProviderCard;

// Memoized wrappers: card grids re-render on filter changes; memo keeps
// unchanged cards stable so only the filtered subset re-renders.
export const MemoProviderCard = memo(ProviderCard);
export const MemoApiKeyProviderCard = memo(ApiKeyProviderCard);
export const MemoBaseProviderCard = memo(BaseProviderCard);
