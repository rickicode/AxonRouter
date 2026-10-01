"use client";

// Difficulty-judge classifier chain editor.
//
// The operator picks an ORDERED ladder of classifier upstreams; the resolver tries
// them left to right and the first one that answers wins. Two hop types, because
// the requirement is "any model, any provider":
//
//   Jev    a System One upstream declared by the provider registry (fast, free,
//          but a single point of failure — it can be rate-limited, parked on a
//          Retry-After cooldown, or fail per egress IP).
//   Judge  ANY model on ANY provider, answered through the normal chat path. Slower
//          and metered, but it is the escape hatch that keeps the classifier alive
//          when every System One upstream is down.
//
// Order is meaningful and is never rewritten by the app: a System One hop belongs
// first (cheap), judges after (fallback). Entries are capped by normalizeJevChain
// so one request can never fan out unbounded.
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Modal, Button, ModelSelectModal } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { JEV_MODEL_CHOICES } from "open-sse/config/jevModels.js";
import { JEV_CHAIN_MAX_ENTRIES, jevChainEntryLabel, normalizeJevChain } from "open-sse/config/jevChain.js";

const JEV_HOP_OPTIONS = JEV_MODEL_CHOICES.map((c) => ({
  key: `${c.provider}|${c.value}`,
  entry: { mode: "jev", provider: c.provider, model: c.value },
  label: c.label,
}));

export default function JevChainEditor({
  isOpen,
  onClose,
  chain = [],
  onSave,
  activeProviders,
  comboOverrideActive = false,
}) {
  const [draft, setDraft] = useState([]);
  const [addJev, setAddJev] = useState("");
  const [showJudgePicker, setShowJudgePicker] = useState(false);
  const [error, setError] = useState("");

  // Re-seed from the saved chain each time the editor opens, so a cancelled edit
  // never leaks into the next one.
  useEffect(() => {
    if (isOpen) {
      setDraft(normalizeJevChain(chain));
      setAddJev("");
      setError("");
    }
  }, [isOpen, chain]);

  const full = draft.length >= JEV_CHAIN_MAX_ENTRIES;

  const move = (index, delta) =>
    setDraft((prev) => {
      const next = [...prev];
      const to = index + delta;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const removeAt = (index) => setDraft((prev) => prev.filter((_, i) => i !== index));

  const addJevHop = (key) => {
    const found = JEV_HOP_OPTIONS.find((o) => o.key === key);
    if (!found) return;
    setAddJev("");
    setDraft((prev) => normalizeJevChain([...prev, found.entry]));
  };

  const addJudgeHop = (model) => {
    setShowJudgePicker(false);
    const value = typeof model === "string" ? model : model?.value;
    if (!value) return;
    setDraft((prev) => normalizeJevChain([...prev, { mode: "judge", model: value }]));
  };

  const save = () => {
    // The same normalizer the resolver and the API use, so what the operator sees
    // as saved is exactly what will run.
    const normalized = normalizeJevChain(draft);
    if (normalized.length !== draft.length) {
      setError("Some entries were removed: a hop needs a model, and a Jev hop must name a registered upstream.");
      return;
    }
    onSave(normalized);
    onClose();
  };

  const hopRows = useMemo(
    () =>
      draft.map((entry, index) => ({
        entry,
        index,
        label: jevChainEntryLabel(entry),
        isJev: entry.mode === "jev",
      })),
    [draft]
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Classifier Chain (fallback order)"
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
              title="Clear the ladder and fall back to the single Jev model setting"
            >
              Clear chain
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={save} disabled={draft.length === 0}>
                Save chain
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Tried top to bottom; the first hop that answers wins. A hop hands over to the next one
            only on a real failure, such as a dead call, a rate-limited upstream in cooldown, or a
            missing key. A hop that answered is never re-asked elsewhere, even at low confidence.
            {comboOverrideActive ? " Saved to this combo." : " Saved as the global default."}
          </p>

          {hopRows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border-subtle px-3 py-4 text-center text-xs text-text-muted">
              No chain configured. The single Jev model setting is used, exactly as before.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {hopRows.map(({ entry, index, label, isJev }) => (
                <li
                  key={`${entry.mode}-${entry.provider}-${entry.model}-${index}`}
                  className="flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-raised px-2.5 py-1.5"
                >
                  <span className="w-5 shrink-0 text-center font-mono text-[10px] text-text-muted">
                    {index + 1}
                  </span>
                  <span
                    className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                      isJev
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                        : "bg-primary/10 text-primary border border-primary/30"
                    }`}
                  >
                    {isJev ? "Jev" : "Judge"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={label}>
                    {label}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent sm:min-h-9 sm:min-w-9"
                      aria-label={`Move hop ${index + 1} up, so it is tried earlier`}
                      title="Move up (tried earlier)"
                    >
                      <Icon name="keyboard_arrow_up" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === hopRows.length - 1}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-text-muted hover:text-text-primary hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent sm:min-h-9 sm:min-w-9"
                      aria-label={`Move hop ${index + 1} down, so it is tried later`}
                      title="Move down (tried later)"
                    >
                      <Icon name="keyboard_arrow_down" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-text-muted hover:text-danger hover:bg-danger/10 sm:min-h-9 sm:min-w-9"
                      aria-label={`Remove hop ${index + 1}`}
                      title="Remove this hop"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
            <span className="text-xs font-medium text-text-muted">Add hop:</span>
            <select
              value={addJev}
              onChange={(e) => addJevHop(e.target.value)}
              disabled={full}
              className="min-h-11 min-w-0 sm:min-h-9 max-w-[260px] rounded-sm border border-cyan-500/30 bg-cyan-500/10 px-2 font-mono text-xs text-cyan-400 disabled:opacity-40"
              title="Add a System One (Jev) upstream from the provider registry"
              aria-label="Add a System One (Jev) upstream from the provider registry"
            >
              <option value="">Jev upstream…</option>
              {JEV_HOP_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} className="bg-surface text-text-primary">
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowJudgePicker(true)}
              disabled={full}
              title="Add any model on any provider as a fallback classifier"
            >
              <Icon name="add" size={14} />
              <span>Any model</span>
            </Button>
            {full ? (
              <span className="text-[11px] text-text-muted">Ladder is full ({JEV_CHAIN_MAX_ENTRIES}).</span>
            ) : null}
          </div>
        </div>
      </Modal>

      {showJudgePicker && (
        <ModelSelectModal
          isOpen={showJudgePicker}
          onClose={() => setShowJudgePicker(false)}
          onSelect={addJudgeHop}
          activeProviders={activeProviders}
          title="Pick a fallback classifier model (any provider)"
          closeOnSelect={true}
        />
      )}
    </>
  );
}

JevChainEditor.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  chain: PropTypes.array,
  onSave: PropTypes.func.isRequired,
  activeProviders: PropTypes.array,
  comboOverrideActive: PropTypes.bool,
};
