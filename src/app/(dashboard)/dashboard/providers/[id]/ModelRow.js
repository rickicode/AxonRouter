"use client";

import PropTypes from "prop-types";
import Icon from "@/shared/components/Icon";
import { CAPACITY_META } from "@/shared/constants/models";
import { cn } from "@/shared/utils/cn";

export default function ModelRow({
  model,
  fullModel,
  alias,
  copied,
  onCopy,
  testStatus,
  isCustom,
  isFree,
  onDeleteAlias,
  onTest,
  isTesting,
  onDisable,
  caps,
  thinkingSuffix,
}) {
  const displayModel = thinkingSuffix ? `${fullModel}(${thinkingSuffix})` : fullModel;
  const isCopied = copied === `model-${model.id}`;
  const displayName = model.name && model.name !== model.id ? model.name : null;

  // Active capabilities
  const activeCaps = caps ? Object.keys(CAPACITY_META).filter((k) => caps[k]) : [];

  // Status mapping
  const statusBorder =
    testStatus === "ok"
      ? "border-success/40 hover:border-success/70"
      : testStatus === "error"
      ? "border-danger/40 hover:border-danger/70"
      : "border-border/80 hover:border-primary/50";

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-lg border bg-surface/80 p-3.5",
        "transition-all duration-160 ease-out hover:bg-surface hover:shadow-sm",
        statusBorder
      )}
    >
      {/* Top row: Avatar + Title & Badges + Quick Action Buttons */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-start gap-2.5 flex-1">
          {/* Status / Model avatar */}
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md border text-xs",
              "transition-colors duration-150",
              testStatus === "ok"
                ? "border-success/30 bg-success/10 text-success"
                : testStatus === "error"
                ? "border-danger/30 bg-danger/10 text-danger"
                : isTesting
                ? "border-primary/30 bg-primary/10 text-primary animate-pulse"
                : "border-border/80 bg-surface-2 text-text-muted group-hover:border-primary/30 group-hover:text-primary"
            )}
          >
            <Icon
              name={
                testStatus === "ok"
                  ? "check_circle"
                  : testStatus === "error"
                  ? "cancel"
                  : isTesting
                  ? "progress_activity"
                  : "smart_toy"
              }
              size={15}
              style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
            />
          </div>

          {/* Model Name and Badges */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <span
                className="truncate text-xs font-semibold text-text-main transition-colors group-hover:text-primary"
                title={displayName || model.id}
              >
                {displayName || model.id}
              </span>

              {isFree && (
                <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold tracking-wider text-emerald-400">
                  FREE
                </span>
              )}

              {isCustom && (
                <span className="shrink-0 inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-px text-[9px] font-semibold tracking-wider text-purple-400">
                  CUSTOM
                </span>
              )}

              {alias && (
                <span
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary"
                  title={`Alias: ${alias}`}
                >
                  <span className="opacity-60">alias:</span>
                  {alias}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action button cluster */}
        <div className="flex items-center gap-1 shrink-0 -mr-1">
          {onTest && (
            <button
              onClick={onTest}
              disabled={isTesting}
              aria-label={isTesting ? `Testing ${displayModel}` : `Test ${displayModel}`}
              title={isTesting ? "Testing connectivity..." : "Test model"}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded border border-border/40 bg-surface-2 text-text-muted",
                "hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-95",
                "transition-[background-color,border-color,color,transform] duration-150 ease-out",
                isTesting && "opacity-100 border-primary/40 text-primary bg-primary/10"
              )}
            >
              <Icon
                name={isTesting ? "progress_activity" : "science"}
                size={13}
                style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
              />
            </button>
          )}

          <button
            onClick={() => onCopy(displayModel, `model-${model.id}`)}
            aria-label={`Copy model ID ${displayModel}`}
            title={isCopied ? "Copied!" : "Copy model ID"}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded border border-border/40 bg-surface-2 text-text-muted",
              "hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-95",
              "transition-[background-color,border-color,color,transform] duration-150 ease-out",
              isCopied && "border-success/40 bg-success/10 text-success hover:border-success/40 hover:bg-success/10 hover:text-success"
            )}
          >
            <Icon name={isCopied ? "check" : "content_copy"} size={13} />
          </button>

          {isCustom ? (
            <button
              onClick={onDeleteAlias}
              aria-label={`Remove custom model ${model.id}`}
              title="Remove custom model"
              className={cn(
                "inline-flex size-7 items-center justify-center rounded border border-border/40 bg-surface-2 text-text-muted",
                "hover:border-danger/40 hover:bg-danger/10 hover:text-danger active:scale-95",
                "transition-[background-color,border-color,color,transform] duration-150 ease-out"
              )}
            >
              <Icon name="close" size={13} />
            </button>
          ) : onDisable ? (
            <button
              onClick={onDisable}
              aria-label={`Disable model ${model.id}`}
              title="Disable this model"
              className={cn(
                "inline-flex size-7 items-center justify-center rounded border border-border/40 bg-surface-2 text-text-muted",
                "hover:border-danger/40 hover:bg-danger/10 hover:text-danger active:scale-95",
                "transition-[background-color,border-color,color,transform] duration-150 ease-out"
              )}
            >
              <Icon name="close" size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Middle row: Endpoint ID pill (clickable for quick copy) */}
      <button
        type="button"
        onClick={() => onCopy(displayModel, `model-${model.id}`)}
        title={isCopied ? "Copied to clipboard!" : `Click to copy: ${displayModel}`}
        className={cn(
          "mt-2.5 flex w-full items-center justify-between gap-1.5 rounded px-2 py-1 text-left",
          "border border-border/50 bg-surface-2/90",
          "hover:border-primary/40 hover:bg-surface-2 active:scale-[0.99]",
          "transition-[border-color,background-color,transform] duration-150 ease-out cursor-pointer",
          isCopied && "border-success/40 bg-success/10 text-success"
        )}
      >
        <code className="truncate font-mono text-[11px] text-text-muted hover:text-text-main">
          {displayModel}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          {thinkingSuffix && (
            <span className="rounded bg-primary/10 border border-primary/20 px-1 text-[9px] font-mono text-primary">
              {thinkingSuffix}
            </span>
          )}
          <Icon
            name={isCopied ? "check" : "content_copy"}
            size={11}
            className={isCopied ? "text-success" : "text-text-subtle"}
          />
        </div>
      </button>

      {/* Bottom row: Capabilities badges & Status */}
      <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px]">
        {/* Capabilities labeled pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {activeCaps.length > 0 ? (
            activeCaps.map((k) => {
              const meta = CAPACITY_META[k];
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded bg-surface-3/80 px-1.5 py-0.5 text-[10px] text-text-muted border border-border/60"
                  title={`${meta.label} — ${meta.desc}`}
                >
                  <Icon name={meta.icon} size={11} className={meta.color} />
                  <span>{meta.label}</span>
                </span>
              );
            })
          ) : (
            <span className="text-[10px] text-text-subtle font-mono">llm · chat</span>
          )}
        </div>

        {/* Live test status */}
        <div className="shrink-0">
          {testStatus === "ok" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              Verified
            </span>
          )}
          {testStatus === "error" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-danger">
              <span className="size-1.5 rounded-full bg-danger" />
              Failed
            </span>
          )}
          {isTesting && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              Testing
            </span>
          )}
          {!testStatus && !isTesting && (
            <span className="text-[10px] text-text-subtle">Ready</span>
          )}
        </div>
      </div>
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
