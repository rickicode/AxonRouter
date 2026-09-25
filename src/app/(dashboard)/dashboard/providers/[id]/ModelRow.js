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
  testError,
  isCustom,
  isFree,
  onDeleteAlias,
  onSetAlias,
  onTest,
  isTesting,
  onDisable,
  caps,
  thinkingSuffix,
}) {
  const displayModel = thinkingSuffix ? `${fullModel}(${thinkingSuffix})` : fullModel;
  const isCopied = copied === `model-${model.id}`;
  const displayName = model.name && model.name !== model.id ? model.name : null;

  // Active capabilities as compact icons with tooltips
  const activeCaps = caps ? Object.keys(CAPACITY_META).filter((k) => caps[k]) : [];

  const statusBorder =
    testStatus === "ok"
      ? "border-success/40 bg-surface/90"
      : testStatus === "error"
      ? "border-danger/40 bg-surface/90"
      : "border-border/70 bg-surface/70 hover:border-primary/40 hover:bg-surface";

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-md border p-2 transition-all duration-150 shadow-xs",
        statusBorder
      )}
    >
      {/* Baris 1: Status dot + Nama Model (klik untuk copy) + Badges + Action Buttons */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Status dot indicator */}
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              testStatus === "ok"
                ? "bg-success"
                : testStatus === "error"
                ? "bg-danger"
                : isTesting
                ? "bg-primary animate-pulse"
                : "bg-text-subtle/50"
            )}
            title={
              testStatus === "ok"
                ? "Verified"
                : testStatus === "error"
                ? `Failed: ${testError || "Model not reachable"}`
                : isTesting
                ? "Testing..."
                : "Ready"
            }
          />

          {/* Klik nama model untuk langsung copy (tanpa icon copy terpisah) */}
          <button
            type="button"
            onClick={() => onCopy(displayModel, `model-${model.id}`)}
            title={isCopied ? "Copied!" : `Click to copy: ${displayModel}`}
            className="truncate font-mono text-xs font-medium text-text-main group-hover:text-primary transition-colors text-left cursor-pointer"
          >
            {isCopied ? (
              <span className="text-success inline-flex items-center gap-1 font-sans text-[11px]">
                <Icon name="check" size={12} /> Copied!
              </span>
            ) : (
              model.id
            )}
          </button>

          {/* Small pills */}
          {isFree && (
            <span className="shrink-0 rounded bg-emerald-500/10 px-1 py-px text-[9px] font-semibold text-emerald-400 border border-emerald-500/20">
              FREE
            </span>
          )}

          {isCustom && (
            <span className="shrink-0 rounded bg-purple-500/10 px-1 py-px text-[9px] font-semibold text-purple-400 border border-purple-500/20">
              CUSTOM
            </span>
          )}

          {alias ? (
            <button
              type="button"
              onClick={() => onSetAlias?.(model.id, alias)}
              className="shrink-0 rounded bg-primary/10 px-1 py-px text-[9px] font-mono text-primary border border-primary/20 hover:border-primary/50 transition-colors cursor-pointer"
              title={`Alias: ${alias} — Click to edit`}
            >
              {alias}
            </button>
          ) : null}
        </div>

        {/* Action icons cluster: hanya test & disable/remove */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          {onTest && (
            <button
              onClick={onTest}
              disabled={isTesting}
              aria-label={`Test ${model.id}`}
              title={isTesting ? "Testing..." : "Test model"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer",
                isTesting && "text-primary"
              )}
            >
              <Icon
                name={isTesting ? "progress_activity" : "science"}
                size={13}
                style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
              />
            </button>
          )}
          {onSetAlias && (
            <button
              type="button"
              onClick={() => onSetAlias(model.id, alias)}
              aria-label={`Set alias for ${model.id}`}
              title={alias ? `Edit alias (${alias})` : "Set model alias"}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer",
                alias && "text-primary"
              )}
            >
              <Icon name="label" size={12} />
            </button>
          )}

          {isCustom ? (
            <button
              onClick={onDeleteAlias}
              aria-label={`Remove custom model ${model.id}`}
              title="Remove custom model"
              className="inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
            >
              <Icon name="close" size={13} />
            </button>
          ) : onDisable ? (
            <button
              onClick={onDisable}
              aria-label={`Disable model ${model.id}`}
              title="Disable this model"
              className="inline-flex size-6 items-center justify-center rounded text-text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
            >
              <Icon name="close" size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Baris 2: Subtitle alias/full path (klik untuk copy) + Capability icons */}
      <div className="mt-1 flex items-center justify-between gap-1.5 border-t border-border/40 pt-1 text-[10px]">
        <button
          type="button"
          onClick={() => onCopy(displayModel, `model-${model.id}`)}
          title={`Click to copy: ${displayModel}`}
          className="truncate font-mono text-[10px] text-text-subtle hover:text-text-main text-left cursor-pointer max-w-[70%]"
        >
          {displayModel}
        </button>

        {/* Compact capability icons with tooltips */}
        <div className="flex items-center gap-1 shrink-0">
          {activeCaps.length > 0 ? (
            activeCaps.map((k) => {
              const meta = CAPACITY_META[k];
              return (
                <span
                  key={k}
                  className="inline-flex items-center justify-center text-text-muted hover:text-text-main"
                  title={`${meta.label}: ${meta.desc}`}
                >
                  <Icon name={meta.icon} size={11} className={meta.color} />
                </span>
              );
            })
          ) : (
            <span className="text-[9px] text-text-subtle">chat</span>
          )}
        </div>
      </div>
      {testStatus === "error" && testError && (
        <p className="mt-1 truncate text-[9px] text-danger border-t border-danger/20 pt-0.5 font-mono" title={testError}>
          {testError}
        </p>
      )}
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
  testStatus: PropTypes.oneOf(["ok", "error", null, undefined]),
  testError: PropTypes.string,
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onSetAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
