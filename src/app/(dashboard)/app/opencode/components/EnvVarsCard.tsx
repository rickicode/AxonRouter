"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

function createEmptyEnvVar() {
  return {
    key: "",
    value: "",
    secret: true,
    masked: false,
  };
}

export default function EnvVarsCard({ preferences, saving = false, error = "", onSave }) {
  const [draftVars, setDraftVars] = useState(() =>
    (preferences?.envVars || []).map((item) => ({
      key: item.key || "",
      value: item.secret ? "" : item.value || "",
      secret: item.secret === true,
      masked: item.secret === true,
    }))
  );
  const [localError, setLocalError] = useState("");

  const updateItem = (index, patch) => {
    setDraftVars((current) => current.map((item, currentIndex) => (currentIndex === index ? { ...item, ...patch, masked: false } : item)));
  };

  const addRow = () => {
    setDraftVars((current) => [...current, createEmptyEnvVar()]);
  };

  const removeRow = (index) => {
    setDraftVars((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSave = () => {
    const hasHiddenValue = draftVars.some(
      (item) => item.key.trim() && item.masked && !item.value
    );

    if (hasHiddenValue) {
      setLocalError("Re-enter masked values before saving, or remove those rows.");
      return;
    }

    setLocalError("");

    const payload = draftVars
      .filter((item) => item.key.trim())
      .map(({ masked: _masked, ...item }) => ({
        key: item.key.trim(),
        value: item.value,
        secret: item.secret === true,
      }));

    onSave?.({ envVars: payload });
  };

  return (
    <Card className="rounded border-[rgba(15,0,0,0.12)] bg-[#201d1d] font-['Berkeley_Mono'] text-[#fdfcfc]">
      <CardHeader>
        <div>
          <CardTitle>Environment variables</CardTitle>
          <CardDescription>Pass secrets securely directly into the configuration block.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-[1.125rem]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-bold text-[#fdfcfc]">Config-backed variables</p>
              <p className="text-[14px] leading-[2.00] text-[#9a9898]">Secrets remain masked in the UI and should be re-entered before saving changes.</p>
            </div>
            <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#201d1d] px-3 py-1 text-[14px] font-bold text-[#ec4899]">
              {draftVars.length} configured
            </div>
          </div>
        </div>

        {error ? <p className="text-[14px] text-[#ff3b30]">{error}</p> : null}
        {localError ? <p className="text-[14px] text-[#ff3b30]">{localError}</p> : null}

        <div className="flex flex-col gap-4">
          {draftVars.length === 0 ? (
            <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-6 text-[14px] text-[#9a9898]">No environment variables configured yet.</div>
          ) : (
            draftVars.map((item, index) => (
              <div key={`${item.key || "env"}-${index}`} className="flex flex-col gap-5 rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] font-bold text-[#fdfcfc]">Variable {index + 1}</p>
                    <p className="mt-1 text-[14px] leading-[2.00] text-[#9a9898]">{item.secret ? "Stored as a secret" : "Stored as plain text in preview"}</p>
                  </div>
                  <Button variant="ghost" className="text-[#ff3b30] hover:text-[#ff3b30]" onClick={() => removeRow(index)}>
                    Remove
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Field>
                    <FieldLabel>Key</FieldLabel>
                    <Input
                      value={item.key || ""}
                      onChange={(event) => updateItem(index, { key: event.target.value })}
                      placeholder="VARIABLE_NAME"
                    />
                  </Field>
                  <div className="flex flex-col gap-3">
                    <Field>
                      <FieldLabel>Value</FieldLabel>
                      <Input
                        value={item.value || ""}
                        onChange={(event) => updateItem(index, { value: event.target.value })}
                        placeholder={item.masked ? "Re-enter secret value" : "Value"}
                        type={item.secret ? "password" : "text"}
                      />
                    </Field>
                    <label className="flex items-center justify-between gap-3 rounded border border-[rgba(15,0,0,0.12)] bg-[#201d1d] px-3 py-2 text-[14px] text-[#9a9898]">
                      <span>Secret</span>
                      <Switch
                        checked={item.secret || false}
                        onToggle={(checked) => updateItem(index, { secret: checked })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <Button variant="secondary" onClick={addRow}>
            Add variable
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving" : "Save variables"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
