"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

function formatDate(value) {
  if (!value) return "Never";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function TokenManagerCard({
  tokens = [],
  creating = false,
  createError = "",
  createdToken = "",
  onCreate,
}) {
  const [name, setName] = useState("My Token");
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <Card className="rounded border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-main)]">
      <CardHeader>
        <div>
          <CardTitle>Auto-sync tokens</CardTitle>
          <CardDescription>Create tokens to enable automatic config sync from this dashboard.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-5 py-[1.125rem]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-bold text-[var(--color-text-main)] leading-[1.50]">Create a sync token</p>
              <p className="text-[14px] leading-[2.00] text-[var(--color-text-muted)]">Tokens allow OpenCode to sync config from this dashboard automatically.</p>
            </div>
            <Badge variant="secondary">{tokens.length} active</Badge>
          </div>
        </div>

        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-5 py-5">
          <div className="mb-4 space-y-1">
            <p className="text-[16px] font-bold text-[var(--color-text-main)]">Issue a new token</p>
            <p className="text-[14px] leading-[2.00] text-[var(--color-text-muted)]">New token values are only shown once, so create them only when you are ready to copy.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Field>
              <FieldLabel>Token name</FieldLabel>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production Server"
              />
              <FieldDescription>Give it a descriptive name to identify where it is used.</FieldDescription>
            </Field>
            <div className="flex items-end">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => onCreate?.({ name, mode: "shared" })}
                disabled={!name.trim() || creating}
              >
                {creating ? <Spinner data-icon="inline-start" /> : null}
                {creating ? "Creating..." : "Create token"}
              </Button>
            </div>
          </div>
        </div>

        {createError ? (
          <Alert variant="destructive">
            <AlertTitle>Token creation failed</AlertTitle>
            <AlertDescription>{createError}</AlertDescription>
          </Alert>
        ) : null}

        {createdToken ? (
          <div className="space-y-4">
            <Alert className="border-[var(--color-success)]/20 bg-[var(--color-success)]/10">
              <AlertTitle className="flex flex-wrap items-center gap-2">
                <Badge>New token</Badge>
                <span>Shown once — copy it now.</span>
              </AlertTitle>
              <AlertDescription className="mt-3 flex flex-col gap-3">
                <code className="block overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-text-main)]">
                  {createdToken}
                </code>
                <span className="text-[var(--color-warning)]">
                  This token will not be shown again. Save it securely before closing this message.
                </span>
              </AlertDescription>
            </Alert>

            {/* Setup Instructions */}
            <div className="space-y-3 rounded border border-[var(--color-info)]/20 bg-[var(--color-info)]/10 px-5 py-[1.125rem]">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between px-0 text-left text-[var(--color-info)] hover:bg-transparent hover:text-[var(--color-info)]"
                onClick={() => setShowInstructions(!showInstructions)}
              >
                <span className="text-[16px] font-bold text-[var(--color-info)]">
                  Setup Instructions
                </span>
                <span aria-hidden="true">
                  {showInstructions ? "▼" : "▶"}
                </span>
              </Button>

              {showInstructions && (
                <div className="space-y-4 pt-2 text-[14px] text-[var(--color-text-main)]">
                  <div>
                    <p className="font-bold mb-2">1. Add to opencode.json plugin array:</p>
                    <code className="block rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-text-main)] overflow-x-auto">
                      &quot;plugin&quot;: [&quot;opencode-axonrouter-sync@latest&quot;, ...]
                    </code>
                  </div>

                  <div>
                    <p className="font-bold mb-2">2. Create config file:</p>
                    
                    {/* Standard */}
                    <div className="mb-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="font-bold mb-1 text-[var(--color-text-main)]">Standard:</p>
                      <code className="block text-[14px] text-[var(--color-text-muted)] mb-2">
                        ~/.config/opencode-axonrouter-sync/config.json
                      </code>
                      <pre className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-text-main)] overflow-x-auto">
{`{
  "dashboardUrl": "${typeof window !== "undefined" ? window.location.origin : DEFAULT_AXONROUTER_BASE_URL}",
  "syncToken": "${createdToken}",
  "lastKnownVersion": null
}`}
                      </pre>
                    </div>

                    {/* OCX Profile */}
                    <div className="rounded border border-[var(--color-success)]/20 bg-[var(--color-success)]/10 p-3">
                      <p className="font-bold mb-1 text-[var(--color-success)]">With OCX Profile:</p>
                      <code className="block text-[14px] text-[var(--color-success)] mb-2">
                        ~/.config/opencode/profiles/&lt;profilename&gt;/opencode-axonrouter-sync/config.json
                      </code>
                      <pre className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-text-main)] overflow-x-auto">
{`{
  "dashboardUrl": "${typeof window !== "undefined" ? window.location.origin : DEFAULT_AXONROUTER_BASE_URL}",
  "syncToken": "${createdToken}",
  "lastKnownVersion": null
}`}
                      </pre>
                    </div>
                  </div>

                  <div className="rounded border border-[var(--color-info)]/20 bg-[var(--color-info)]/10 px-3 py-2">
                    <p className="text-[var(--color-info)]">
                      ✨ <strong>Auto-sync:</strong> The plugin will automatically sync your config from AxonRouter dashboard on OpenCode startup.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {tokens.length === 0 ? (
            <Empty className="border-dashed bg-[var(--color-surface)] py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon"><AppIcon name="vpn_key" /></EmptyMedia>
                <EmptyTitle>No auto-sync tokens created yet</EmptyTitle>
                <EmptyDescription>Create a token when you are ready to connect an OpenCode sync plugin.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            tokens.map((token) => (
              <div key={token.id} className="space-y-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-bold text-[var(--color-text-main)]">{token.name}</div>
                    <div className="mt-1 text-[14px] text-[var(--color-text-muted)]">Created {formatDate(token.createdAt)}</div>
                  </div>
                </div>
                {token.metadata && Object.keys(token.metadata).length > 0 ? (
                  <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-text-muted)]">
                    {JSON.stringify(token.metadata, null, 2)}
                  </pre>
                ) : null}
                <div className="text-[14px] text-[var(--color-text-muted)]">Last used: {formatDate(token.lastUsedAt)}</div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
