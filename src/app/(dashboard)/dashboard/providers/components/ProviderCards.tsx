"use client";

import { PauseCircle, Zap } from "lucide-react";
import PropTypes from "prop-types";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  getProviderSupportedModes,
} from "@/shared/constants/providers";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { getStatusDisplayItems } from "../statusDisplay";
import { ProviderCategoryBadge } from "./ProviderCategoryBadge";

function getProviderBadgeVariant(tone) {
  if (tone === "error") return "destructive";
  return tone === "secondary" ? "secondary" : "outline";
}

function getProviderBadgeClass(tone) {
  if (tone === "ready") return "border-[var(--color-success)]/35 bg-[var(--color-success)]/18 text-white";
  if (tone === "success") return "border-[var(--color-success)]/35 bg-[var(--color-success)]/14 text-[var(--color-success)]";
  return "";
}

function ProviderStatusBadge({ children, tone = "default", showDot = false }) {
  return (
    <ShadcnBadge variant={getProviderBadgeVariant(tone)} className={getProviderBadgeClass(tone)}>
      {showDot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </ShadcnBadge>
  );
}

export function ProviderCard({ providerId, provider, stats, authType, onToggle, onTest, testing }) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isNoAuth = !!provider.noAuth;

  const getIconPath = () => {
    if (provider.id === "commandcode" || provider.id === "mimo") {
      return `/providers/${provider.id}.svg`;
    }
    if (provider.id === "morph-fast") {
      return "/providers/morph-fast.svg";
    }
    return `/providers/${provider.id}.png`;
  };

  return (
    <Link href={`/dashboard/providers/${providerId}`} className="group">
      <Card
        className={`h-full cursor-pointer transition-colors hover:bg-card/70 ${allDisabled ? "opacity-50" : ""}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="size-8 rounded flex items-center justify-center"
                style={{
                  backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
                }}
              >
                <ProviderIcon
                  src={getIconPath()}
                  alt={provider.name}
                  size={30}
                  className="object-contain rounded max-w-[32px] max-h-[32px]"
                  fallbackText={
                    provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                  }
                  fallbackColor={provider.color}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{provider.name}</h3>
                  <ProviderCategoryBadge providerId={providerId} />
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {allDisabled ? (
                    <ProviderStatusBadge tone="secondary">
                      <span className="flex items-center gap-1">
                        <PauseCircle className="size-3" strokeWidth={2} />
                        Disabled
                      </span>
                    </ProviderStatusBadge>
                  ) : isNoAuth ? (
                    <>
                      <ProviderStatusBadge tone="ready">Ready</ProviderStatusBadge>
                      {getProviderSupportedModes(provider).map((mode) => (
                        <ProviderStatusBadge key={mode}>{mode}</ProviderStatusBadge>
                      ))}
                    </>
                  ) : (
                    <>
                       {getStatusDisplayItems(connected, error, stats.total, errorCode).map((item) => (
                        <ProviderStatusBadge key={item.key} tone={item.variant} showDot={item.dot}>
                          {item.label}
                        </ProviderStatusBadge>
                      ))}
                      {getProviderSupportedModes(provider).map((mode) => (
                        <ProviderStatusBadge key={mode}>{mode}</ProviderStatusBadge>
                      ))}
                      {errorTime && (
                        <span className="text-muted-foreground">{errorTime}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onTest && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTest(); }}
                  disabled={testing}
                  title="Test provider connections"
                >
                  <Zap className={cn("size-3.5", testing && "animate-pulse text-amber-500")} />
                </Button>
              )}
              {stats.total > 0 && (
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(!allDisabled ? false : true);
                  }}
                >
                  <Switch
                    size="sm"
                    checked={!allDisabled}
                    onToggle={() => {}}
                    title={allDisabled ? "Enable provider" : "Disable provider"}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
  onTest: PropTypes.func,
  testing: PropTypes.bool,
};

export function ApiKeyProviderCard({
  providerId,
  provider,
  stats,
  authType,
  onToggle,
  onTest,
  testing,
}) {
  const isSystemManaged = provider.systemManaged === true;
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
  const isAnthropicCompatible = providerId.startsWith(
    ANTHROPIC_COMPATIBLE_PREFIX,
  );

  const getIconPath = () => {
    if (isCompatible)
      return provider.apiType === "responses"
        ? "/providers/oai-r.png"
        : "/providers/oai-cc.png";
    if (isAnthropicCompatible) return "/providers/anthropic-m.png";
    if (provider.id === "commandcode" || provider.id === "mimo") {
      return `/providers/${provider.id}.svg`;
    }
    if (provider.id === "morph-fast") {
      return "/providers/morph-fast.svg";
    }
    return `/providers/${provider.id}.png`;
  };

  return (
    <Link href={`/dashboard/providers/${providerId}`} className="group">
      <Card
        className={`h-full cursor-pointer transition-colors hover:bg-card/70 ${allDisabled ? "opacity-50" : ""}`}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="size-8 rounded flex items-center justify-center"
                style={{
                  backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
                }}
              >
                <ProviderIcon
                  src={getIconPath()}
                  alt={provider.name}
                  size={30}
                  className="object-contain rounded max-w-[30px] max-h-[30px]"
                  fallbackText={
                    provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                  }
                  fallbackColor={provider.color}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{provider.name}</h3>
                  <ProviderCategoryBadge providerId={providerId} />
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {allDisabled ? (
                    <ProviderStatusBadge tone="secondary">
                      <span className="flex items-center gap-1">
                        <PauseCircle className="size-3" strokeWidth={2} />
                        Disabled
                      </span>
                    </ProviderStatusBadge>
                  ) : (
                    <>
                       {getStatusDisplayItems(connected, error, stats.total, errorCode).map((item) => (
                        <ProviderStatusBadge key={item.key} tone={item.variant} showDot={item.dot}>
                          {item.label}
                        </ProviderStatusBadge>
                      ))}
                      {isCompatible && (
                        <ProviderStatusBadge>
                          {provider.apiType === "responses"
                            ? "Responses"
                            : "Chat"}
                        </ProviderStatusBadge>
                      )}
                      {isAnthropicCompatible && (
                        <ProviderStatusBadge>
                          Messages
                        </ProviderStatusBadge>
                      )}
                      {getProviderSupportedModes(provider).map((mode) => (
                        <ProviderStatusBadge key={mode}>{mode}</ProviderStatusBadge>
                      ))}
                      {isSystemManaged && (
                        <ProviderStatusBadge>
                          Managed in Morph
                        </ProviderStatusBadge>
                      )}
                      {errorTime && (
                        <span className="text-muted-foreground">{errorTime}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onTest && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTest(); }}
                  disabled={testing}
                  title="Test provider connections"
                >
                  <Zap className={cn("size-3.5", testing && "animate-pulse text-amber-500")} />
                </Button>
              )}
              {stats.total > 0 && !isSystemManaged && (
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle(!allDisabled ? false : true);
                  }}
                >
                  <Switch
                    size="sm"
                    checked={!allDisabled}
                    onToggle={() => {}}
                    title={allDisabled ? "Enable provider" : "Disable provider"}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

ApiKeyProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    apiType: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
  onTest: PropTypes.func,
  testing: PropTypes.bool,
};
