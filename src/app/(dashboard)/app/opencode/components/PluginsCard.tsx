"use client";

import AppIcon from "@/shared/components/AppIcon";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function PluginsCard({ preferences, saving = false, error = "", onSave }) {
  const [stagedPlugin, setStagedPlugin] = useState("");
  const safePlugins = preferences?.customPlugins || [];

  const addPlugin = () => {
    const nextPlugin = stagedPlugin.trim();
    if (!nextPlugin || safePlugins.includes(nextPlugin)) return;

    onSave?.({ customPlugins: [...safePlugins, nextPlugin] });
    setStagedPlugin("");
  };

  const removePlugin = (pluginName) => {
    onSave?.({ customPlugins: safePlugins.filter((entry) => entry !== pluginName) });
  };

  return (
    <Card className="rounded border-[rgba(15,0,0,0.12)] bg-[#201d1d] font-['Berkeley_Mono'] text-[#fdfcfc]">
      <CardHeader>
        <div>
          <CardTitle>Plugins</CardTitle>
          <CardDescription>Include extra packages into your config.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-[1.125rem]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-bold text-[#fdfcfc]">Plugin packages</p>
              <p className="text-[14px] leading-[2.00] text-[#9a9898]">Add only the extras you actually need so the generated setup stays lean.</p>
            </div>
            <Badge variant="secondary">{safePlugins.length} configured</Badge>
          </div>
        </div>

        <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] px-5 py-5">
          <div className="mb-4 space-y-1">
            <p className="text-[16px] font-bold text-[#fdfcfc]">Add a package</p>
            <p className="text-[14px] leading-[2.00] text-[#9a9898]">Keep plugin additions sparse so the generated setup stays readable.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Field>
              <FieldLabel>Package name</FieldLabel>
              <Input
                value={stagedPlugin}
                onChange={(event) => setStagedPlugin(event.target.value)}
                placeholder="e.g. opencode-plugin-name"
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="secondary"
                className="w-full"
                onClick={addPlugin}
                disabled={!stagedPlugin.trim() || saving}
              >
                Add package
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Plugin update failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded border border-[rgba(15,0,0,0.12)] bg-[#302c2c] p-4">
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <p className="text-[16px] font-bold text-[#fdfcfc]">Current plugin list</p>
            <Badge variant="outline">{safePlugins.length}</Badge>
          </div>
          <div className="flex min-h-[40px] flex-wrap gap-2.5">
            {safePlugins.length === 0 ? (
              <Empty className="w-full border-dashed bg-[#201d1d] py-7 text-[#9a9898]">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><AppIcon name="extension" /></EmptyMedia>
                  <EmptyTitle>No custom plugins added</EmptyTitle>
                  <EmptyDescription>Add plugin packages only when a workspace needs extra OpenCode behavior.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              safePlugins.map((item) => (
                <Badge key={item} variant="secondary" className="flex max-w-full items-center gap-2 pr-1 font-mono">
                  <span className="max-w-[240px] truncate">{item}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-[#9a9898] hover:text-[#ff3b30]"
                    onClick={() => removePlugin(item)}
                    aria-label={`Remove ${item}`}
                  >
                    <AppIcon name="close" size={14} />
                  </Button>
                </Badge>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
