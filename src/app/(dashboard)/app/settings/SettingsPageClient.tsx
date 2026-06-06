"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import ProfileSettingsContent from "@/shared/components/settings/ProfileSettingsContent";
import { fetchJson, queryKeys, useInvalidate } from "@/shared/query";

export default function SettingsPageClient() {
	const inv = useInvalidate();
	const [usageCheckSettings, setUsageCheckSettings] = useState({
		enabled: true,
		intervalMinutes: 60,
	});
	const [savingUsageCheck, setSavingUsageCheck] = useState(false);
	const [usageCheckFeedback, setUsageCheckFeedback] = useState({
		type: "",
		message: "",
	});
	const settingsQuery = useQuery({
		queryKey: queryKeys.settings(),
		queryFn: ({ signal }) => fetchJson("/api/settings", { signal }),
	});
	useEffect(() => {
		const settings: any = settingsQuery.data;
		if (!settings) return;
		const uc = settings?.usageCheck || {};
		queueMicrotask(() => {
			setUsageCheckSettings({
				enabled: uc.enabled !== false,
				intervalMinutes:
					Number.isFinite(uc.intervalMinutes) && uc.intervalMinutes > 0
						? Math.max(1, Math.round(uc.intervalMinutes))
						: 60,
			});
		});
	}, [settingsQuery.data]);

	async function handleSaveUsageCheck() {
		setSavingUsageCheck(true);
		setUsageCheckFeedback({ type: "", message: "" });
		try {
			const response = await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ usageCheck: usageCheckSettings }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(data.error || "Failed to save usage check settings");
			// Reload scheduler to pick up new interval immediately
			await fetch("/api/usage-worker/status", {
				method: "POST",
				cache: "no-store",
			}).catch(() => {});
			setUsageCheckFeedback({
				type: "success",
				message:
					"Usage check settings saved. Scheduler restarted with new interval.",
			});
			inv.settings();
		} catch (error: any) {
			setUsageCheckFeedback({
				type: "error",
				message: error?.message || "Failed to save usage check settings",
			});
		} finally {
			setSavingUsageCheck(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<div>
						<CardTitle>Workspace Settings</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<ProfileSettingsContent />
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<div>
						<CardTitle>Usage Check Scheduler</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-4">
						{usageCheckFeedback.message ? (
							<Alert
								variant={
									usageCheckFeedback.type === "error"
										? "destructive"
										: "default"
								}
								className="rounded-[4px]"
							>
								<AlertDescription>
									{usageCheckFeedback.message}
								</AlertDescription>
							</Alert>
						) : null}

						<div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
							<div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4">
								<div className="flex flex-col gap-4">
									<label className="flex gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text-main)]">
										<Switch
											checked={usageCheckSettings.enabled}
											onToggle={(checked) =>
												setUsageCheckSettings((current) => ({
													...current,
													enabled: checked,
												}))
											}
											disabled={savingUsageCheck}
										/>
										<span className="flex flex-col gap-1">
											<span className="block font-medium">
												Enable automatic usage check
											</span>
											<span className="text-[var(--color-text-muted)]">
												AxonRouter will periodically check provider quota usage
												for all active OAuth connections.
											</span>
										</span>
									</label>

									<Field>
										<FieldLabel>Check interval (minutes)</FieldLabel>
										<Input
											type="number"
											min="60"
											step="1"
											value={usageCheckSettings.intervalMinutes}
											onChange={(event) => {
												const value = Number(event.target.value);
												setUsageCheckSettings((current) => ({
													...current,
													intervalMinutes:
														Number.isFinite(value) && value > 0
															? Math.max(60, Math.round(value))
															: 60,
												}));
											}}
											disabled={savingUsageCheck}
										/>
										<FieldDescription>
											How often the scheduler checks usage for all connections.
											Default: 60 minutes. Minimum: 60 minutes.
										</FieldDescription>
									</Field>
								</div>
							</div>

							<div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-alt)]/78 p-4 text-sm leading-6 text-[var(--color-text-muted)]">
								<p>
									<span className="font-medium text-[var(--color-text-main)]">
										Behavior:
									</span>{" "}
									Connections with prior failures are skipped (backoff).
									Accounts that are disabled or have invalid auth are
									permanently skipped.
								</p>
								<p className="mt-2">
									<span className="font-medium text-[var(--color-text-main)]">
										Backoff levels:
									</span>{" "}
									1m → 5m → 15m → 30m → 1h → 2h → 4h (escalating with
									consecutive failures).
								</p>
								<p className="mt-2">
									<span className="font-medium text-[var(--color-text-main)]">
										Force re-check:
									</span>{" "}
									Use the yellow refresh icon on blocked accounts in the Usage
									page to reset backoff and immediately re-check.
								</p>
							</div>
						</div>

						<div className="flex flex-wrap gap-2">
							<Button
								onClick={handleSaveUsageCheck}
								disabled={savingUsageCheck}
							>
								{savingUsageCheck ? <Spinner data-icon="inline-start" /> : null}
								{savingUsageCheck ? "Saving" : "Save Usage Check Settings"}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
