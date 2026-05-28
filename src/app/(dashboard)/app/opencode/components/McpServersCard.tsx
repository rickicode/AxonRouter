"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SERVER_TYPES = {
  local: "Local command",
  remote: "Remote URL",
};

function createEmptyServer() {
  return {
    name: "",
    type: "local",
    command: "",
    args: "",
    url: "",
  };
}

function toStoredServer(draft) {
  if (draft.type === "remote") {
    return {
      name: draft.name.trim(),
      type: "remote",
      url: draft.url.trim(),
    };
  }

  return {
    name: draft.name.trim(),
    type: "local",
    command: [draft.command.trim(), ...draft.args.split(",").map((item) => item.trim()).filter(Boolean)].filter(Boolean),
  };
}

function fromStoredServer(server) {
  const command = Array.isArray(server?.command) ? server.command : [];
  return {
    name: server?.name || "",
    type: server?.type === "remote" ? "remote" : "local",
    command: command[0] || "",
    args: command.slice(1).join(", "),
    url: server?.url || "",
  };
}

export default function McpServersCard({ preferences, saving = false, error = "", onSave }) {
  const [draft, setDraft] = useState(createEmptyServer());
  const [draftServers, setDraftServers] = useState(() =>
    (preferences?.mcpServers || []).map((server) => fromStoredServer(server))
  );
  const [localError, setLocalError] = useState("");

  const validateServer = (server) => {
    if (!server?.name?.trim()) return "Server name is required";
    if (server.type === "remote" && !server.url?.trim()) return `Remote MCP server "${server.name.trim()}" requires a URL`;
    if (server.type !== "remote" && !server.command?.trim()) return `Local MCP server "${server.name.trim()}" requires a command`;
    return "";
  };

  const addServer = () => {
    const validationError = validateServer(draft);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setDraftServers((current) => [...current, draft]);
    setDraft(createEmptyServer());
    setLocalError("");
  };

  const updateDraftServer = (index, patch) => {
    setDraftServers((current) =>
      current.map((item, currentIndex) => (currentIndex === index ? { ...item, ...patch } : item))
    );
  };

  const removeDraftServer = (index) => {
    setDraftServers((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const saveServers = () => {
    const firstInvalid = draftServers.find((server) => validateServer(server));
    if (firstInvalid) {
      setLocalError(validateServer(firstInvalid));
      return;
    }

    setLocalError("");

    onSave?.({
      mcpServers: draftServers
        .filter((server) => server.name.trim())
        .map((server) => toStoredServer(server)),
    });
  };

  return (
    <Card className="rounded border-[rgba(15,0,0,0.12)] bg-[#201d1d] font-['Berkeley_Mono'] text-[#fdfcfc]">
      <CardHeader>
        <div>
          <CardTitle>MCP servers</CardTitle>
          <CardDescription>Connect extra capability endpoints directly via config file.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-[1.125rem]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-bold text-[#fdfcfc]">Connected MCP endpoints</p>
              <p className="text-[14px] leading-[2.00] text-[#9a9898]">Mix local command runners and remote URLs without overcrowding the main setup flow.</p>
            </div>
            <Badge variant="secondary">{draftServers.length} configured</Badge>
          </div>
        </div>

        <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[16px] font-bold text-[#fdfcfc]">Add a server</p>
              <p className="mt-1 text-[14px] leading-[2.00] text-[#9a9898]">Create the next MCP entry, then save the whole list once it feels complete.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="server-name"
              />
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={draft.type} onValueChange={(value) => setDraft((prev) => ({ ...prev, type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVER_TYPES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            {draft.type === "local" ? (
              <Field className="md:col-span-2">
                <FieldLabel>Command</FieldLabel>
                <Input
                  value={draft.command}
                  onChange={(event) => setDraft((prev) => ({ ...prev, command: event.target.value }))}
                  placeholder="npx"
                />
              </Field>
            ) : (
              <Field className="md:col-span-2">
                <FieldLabel>URL</FieldLabel>
                <Input
                  value={draft.url}
                  onChange={(event) => setDraft((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="http://localhost:8080/sse"
                  type="url"
                />
              </Field>
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={addServer}>Stage server</Button>
          </div>
        </div>

        {error ? <p className="text-[14px] text-[#ff3b30]">{error}</p> : null}
        {localError ? <p className="text-[14px] text-[#ff3b30]">{localError}</p> : null}

        <div className="flex flex-col gap-4">
          {draftServers.length === 0 ? (
            <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-6 text-[14px] text-[#9a9898]">No MCP servers configured yet.</div>
          ) : (
            draftServers.map((draftServer, index) => {
              const safeType = Object.keys(SERVER_TYPES).includes(draftServer.type) ? draftServer.type : "local";
              const typeLabel = SERVER_TYPES[safeType];

              return (
                <div key={`${draftServer.name || "server"}-${index}`} className="flex flex-col gap-5 rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-bold text-[#fdfcfc]">{draftServer.name || `Server ${index + 1}`}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-[#9a9898]">
                        <span className="font-bold uppercase tracking-[0.14em]">{typeLabel}</span>
                        <span className="inline-block size-1 rounded-full bg-[#9a9898]/50" />
                        <span className="truncate">{draftServer.disabled ? "Disabled" : "Active"}</span>
                      </div>
                    </div>
                    <Button variant="ghost" className="text-[#ff3b30] hover:text-[#ff3b30]" onClick={() => removeDraftServer(index)}>
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel>Name</FieldLabel>
                      <Input
                        value={draftServer.name || ""}
                        onChange={(event) => updateDraftServer(index, { name: event.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Type</FieldLabel>
                      <Select value={safeType} onValueChange={(value) => updateDraftServer(index, { type: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SERVER_TYPES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>

                    {safeType === "local" ? (
                      <Field className="md:col-span-2">
                        <FieldLabel>Command</FieldLabel>
                        <Input
                          value={draftServer.command || ""}
                          onChange={(event) => updateDraftServer(index, { command: event.target.value })}
                        />
                      </Field>
                    ) : (
                      <Field className="md:col-span-2">
                        <FieldLabel>URL</FieldLabel>
                        <Input
                          value={draftServer.url || ""}
                          onChange={(event) => updateDraftServer(index, { url: event.target.value })}
                          type="url"
                        />
                      </Field>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveServers} disabled={saving}>Save servers</Button>
        </div>
      </CardContent>
    </Card>
  );
}
