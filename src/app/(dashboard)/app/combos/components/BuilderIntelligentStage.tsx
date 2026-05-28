// BuilderIntelligentStage - Using CSS variables for dark/light mode support

import BuilderIntelligentStep from "../BuilderIntelligentStep";

export default function BuilderIntelligentStage({ draft, setDraft, activeProviders }) {
  return (
    <div className="space-y-4">
      <div className="rounded border p-4" style={{ borderColor: "var(--color-primary-soft)", backgroundColor: "var(--color-primary-soft)" }}>
        <p className="mb-4 text-xs font-medium text-[var(--color-primary)]">Intelligent Routing Settings</p>
        <div className="rounded border p-4 bg-[var(--color-surface)] border-[var(--color-border)]">
          <BuilderIntelligentStep
            config={draft.config}
            onChange={(nextConfig) => setDraft((c) => ({ ...c, config: nextConfig }))}
            activeProviders={activeProviders}
          />
        </div>
      </div>
    </div>
  );
}
