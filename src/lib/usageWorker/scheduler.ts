// Usage Worker Scheduler - Simple timer-based scheduler

import { instrumentUsageWorker } from "../observability/otel";
import { getCurrentSettings } from "../settingsAccess";
import { refreshConnectionUsage } from "../connectionUsageRefresh";
import { USAGE_SUPPORTED_PROVIDERS } from "../../shared/constants/providers";
import { normalizeUsageWorkerSettings } from "./config.ts";

async function getCurrentProviderConnections() {
	const { getProviderConnections } = await import("../localDb");
	return getProviderConnections();
}

function isFutureTimestamp(value: unknown) {
	if (
		typeof value !== "string" &&
		typeof value !== "number" &&
		!(value instanceof Date)
	)
		return false;
	const timestamp = new Date(value).getTime();
	return Boolean(value) && Number.isFinite(timestamp) && timestamp > Date.now();
}

export function isUsageRefreshableConnection(connection: any) {
	const waitingForQuotaReset =
		(connection?.routingStatus === "exhausted" ||
			connection?.quotaState === "exhausted") &&
		isFutureTimestamp(connection?.resetAt);

	return (
		USAGE_SUPPORTED_PROVIDERS.includes(connection?.provider) &&
		connection?.authType === "oauth" &&
		connection?.isActive !== false &&
		!waitingForQuotaReset &&
		connection?.routingStatus !== "disabled" &&
		connection?.authState !== "invalid" &&
		connection?.reasonCode !== "auth_invalid" &&
		connection?.reasonCode !== "reauthorization_required"
	);
}

function getConnectionLogLabel(connection: any) {
	const identity =
		connection?.email ||
		connection?.displayName ||
		connection?.connectionName ||
		connection?.name ||
		connection?.id?.slice(0, 8) ||
		"unknown";
	return `${connection?.provider || "provider"}:${identity}`;
}

const INTER_CONNECTION_DELAY_MS = 1500;

async function processSequentially(items, worker, shouldContinue = () => true) {
	for (let index = 0; index < items.length; index += 1) {
		if (!shouldContinue()) return;
		await worker(items[index], index);
		if (index < items.length - 1 && shouldContinue()) {
			await interruptibleDelay(INTER_CONNECTION_DELAY_MS, shouldContinue);
		}
	}
}

function interruptibleDelay(
	ms: number,
	shouldContinue: () => boolean,
): Promise<void> {
	return new Promise((resolve) => {
		const step = 250;
		let elapsed = 0;
		const tick = () => {
			elapsed += step;
			if (!shouldContinue() || elapsed >= ms) return resolve();
			setTimeout(tick, step);
		};
		setTimeout(tick, step);
	});
}

export class UsageScheduler {
	logger: any;
	onStatusChange: ((status: any) => void) | null;
	lastStatusNotifyAt: number;
	enabled: boolean;
	settings: any;
	timerId: ReturnType<typeof setTimeout> | null;
	running: boolean;
	lastRunAt: string | null;
	lastRunStats: any;
	startedAt: string | null;
	nextRunAt: string | null;
	currentRun: any;
	queuedRun: { trigger: string; mode: string } | null;
	activeRun: any;
	runSequence: number;

	constructor({ logger = console, onStatusChange = null } = {}) {
		this.logger = logger;
		this.onStatusChange =
			typeof onStatusChange === "function" ? onStatusChange : null;
		this.lastStatusNotifyAt = 0;
		this.enabled = false;
		this.settings = null;
		this.timerId = null;
		this.running = false;
		this.lastRunAt = null;
		this.lastRunStats = null;
		this.startedAt = null;
		this.nextRunAt = null;
		this.currentRun = null;
		this.queuedRun = null;
		this.activeRun = null;
		this.runSequence = 0;
	}

	notifyStatusChange({ force = false } = {}) {
		if (!this.onStatusChange) return;

		const now = Date.now();
		if (!force && now - this.lastStatusNotifyAt < 1000) return;
		this.lastStatusNotifyAt = now;
		this.onStatusChange(this.getStatus());
	}

	async loadSettings() {
		const dbSettings = await getCurrentSettings();
		this.settings = normalizeUsageWorkerSettings(dbSettings.usageWorker || {});
		this.enabled = this.settings.enabled;
	}

	async start() {
		return instrumentUsageWorker("scheduler.start", {}, async () => {
			this.startedAt = this.startedAt || new Date().toISOString();
			await this.loadSettings();

			if (!this.enabled) {
				this.nextRunAt = null;
				this.logger.log?.("[UsageWorker] Scheduler disabled in settings");
				return;
			}

			this.logger.log?.("[UsageWorker] Starting scheduler...");
			this.scheduleNext();
			this.logger.log?.(
				"[UsageWorker] Scheduler started; waiting for next scheduled run",
			);
		});
	}

	scheduleNext() {
		if (this.timerId) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}

		if (!this.enabled) return;

		const intervalMs = this.settings.intervalMinutes * 60 * 1000;
		this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

		this.timerId = setTimeout(() => {
			this.runConnections({ trigger: "timer", mode: "batch" }).catch(
				(error) => {
					this.logger.error?.("[UsageWorker] Timer run failed:", error);
				},
			);
		}, intervalMs);

		// Allow process to exit if this is the only thing keeping it alive
		if (typeof this.timerId?.unref === "function") {
			this.timerId.unref();
		}
	}

	async runBatch(trigger = "manual") {
		if (this.running) {
			this.logger.warn?.("[UsageWorker] Batch already running, skipping");
			return this.lastRunStats;
		}

		return this.runConnections({ trigger, mode: "batch" });
	}

	requestFullRefresh(trigger = "manual_full_refresh") {
		if (this.running) {
			if (this.activeRun) {
				this.activeRun.cancelled = true;
			}
			if (this.currentRun) {
				this.currentRun.restartRequested = true;
			}
			this.queuedRun = { trigger, mode: "all" };
			this.logger.warn?.(
				"[UsageWorker] Current run will be replaced by requested full refresh",
			);
			this.notifyStatusChange({ force: true });
			return {
				accepted: true,
				queued: false,
				overrideRequested: true,
				status: this.getStatus(),
			};
		}

		this.runConnections({ trigger, mode: "all" }).catch((error) => {
			this.logger.error?.("[UsageWorker] Full refresh failed:", error);
		});

		return {
			accepted: true,
			queued: false,
			status: this.getStatus(),
		};
	}

	async runConnections({ trigger = "manual", mode = "batch" } = {}) {
		return instrumentUsageWorker(
			"run",
			{
				"usage_worker.trigger": trigger,
				"usage_worker.mode": mode,
			},
			async () => {
				if (this.running) {
					this.logger.warn?.("[UsageWorker] Run already running, skipping");
					return this.lastRunStats;
				}

				this.running = true;
				this.nextRunAt = null;
				const runContext = { id: (this.runSequence += 1), cancelled: false };
				this.activeRun = runContext;
				const startedAt = new Date();
				const isFullRefresh = mode === "all";

				this.logger.log?.(
					`[UsageWorker] Run started | trigger=${trigger} | mode=${mode} | at=${startedAt.toISOString()}`,
				);

				const stats: any = {
					trigger,
					mode,
					startedAt: startedAt.toISOString(),
					total: 0,
					success: 0,
					error: 0,
					skipped: 0,
					duration: 0,
				};

				this.currentRun = {
					trigger,
					mode,
					startedAt: stats.startedAt,
					progress: {
						totalCount: 0,
						completedCount: 0,
						successCount: 0,
						errorCount: 0,
						skippedCount: 0,
					},
				};
				this.notifyStatusChange({ force: true });

				try {
					// Reload settings in case they changed
					await this.loadSettings();

					if (!this.enabled && !isFullRefresh) {
						this.logger.log?.("[UsageWorker] Scheduler disabled, stopping");
						this.stop();
						return stats;
					}

					const allConnections = await getCurrentProviderConnections();
					const candidates = allConnections
						.filter(isUsageRefreshableConnection)
						.map((connection) => ({
							connection,
							reason:
								trigger === "manual_full_refresh"
									? "manual_full_refresh"
									: "scheduled",
						}));
					const batch = candidates;
					stats.total = batch.length;
					this.currentRun.progress.totalCount = batch.length;
					this.notifyStatusChange({ force: true });

					if (batch.length === 0) {
						this.logger.log?.("[UsageWorker] No connections to refresh");
						return stats;
					}

					this.logger.log?.(
						`[UsageWorker] Queueing ${batch.length} connections ` +
							`(${candidates.length} refresh candidates) with sequential processing`,
					);
					this.currentRun.progress.currentBatchStart = 1;
					this.currentRun.progress.currentBatchEnd = batch.length;

					await processSequentially(
						batch,
						async (entry, index) => {
							const { connection, reason } = entry;
							const accountLabel = getConnectionLogLabel(connection);
							const progressLabel = `${index + 1}/${batch.length}`;

							if (runContext.cancelled) return;

							try {
								this.logger.log?.(
									`[UsageWorker] → ${progressLabel} ${accountLabel} | checking usage`,
								);

								// Step 1: Try fetch usage directly (like manual refresh)
								let result = await refreshConnectionUsage(connection.id, {
									runConnectionTest: false,
									skipTransientConnectivityErrors: true,
								});

								// Step 2: If usage failed/unavailable, run connection test then retry
								if (
									result.skipped &&
									(result.skipReason === "usage_quota_unavailable" ||
										result.skipReason === "transient_connectivity_error")
								) {
									this.logger.warn?.(
										`[UsageWorker] ⟳ ${progressLabel} ${accountLabel} | ${result.skipReason}, running connection test + retry`,
									);

									result = await refreshConnectionUsage(connection.id, {
										runConnectionTest: true,
										skipTransientConnectivityErrors: true,
									});
								}

								if (result.skipped) {
									stats.skipped++;
									this.currentRun.progress.skippedCount++;
									this.logger.log?.(
										`[UsageWorker] ⏭ ${progressLabel} ${accountLabel} | skipped=${result.skipReason}`,
									);
								} else {
									stats.success++;
									this.currentRun.progress.successCount++;
									this.logger.log?.(
										`[UsageWorker] ✓ ${progressLabel} ${accountLabel} | status=${result.connection?.routingStatus || "ok"}`,
									);
								}
							} catch (error: any) {
								stats.error++;
								this.currentRun.progress.errorCount++;
								this.logger.error?.(
									`[UsageWorker] ✗ ${progressLabel} ${accountLabel} | error=${error.message}`,
								);
							}

							this.currentRun.progress.completedCount++;
							this.notifyStatusChange();
						},
						() => !runContext.cancelled,
					);

					const finishedAt = new Date();
					stats.finishedAt = finishedAt.toISOString();
					stats.duration = finishedAt.getTime() - startedAt.getTime();
					stats.cancelled = runContext.cancelled;

					this.logger.log?.(
						`[UsageWorker] Run ${runContext.cancelled ? "cancelled" : "finished"} | mode=${mode} | ` +
							`success=${stats.success} error=${stats.error} skipped=${stats.skipped} | ` +
							`duration=${stats.duration}ms`,
					);

					this.lastRunAt = finishedAt.toISOString();
					this.lastRunStats = stats;
					this.notifyStatusChange({ force: true });

					return stats;
				} catch (error) {
					this.logger.error?.("[UsageWorker] Run failed:", error);
					throw error;
				} finally {
					this.running = false;
					this.currentRun = null;
					if (this.activeRun === runContext) {
						this.activeRun = null;
					}
					this.notifyStatusChange({ force: true });
					const queuedRun = this.queuedRun;
					this.queuedRun = null;

					if (queuedRun) {
						this.runConnections(queuedRun).catch((error) => {
							this.logger.error?.("[UsageWorker] Queued run failed:", error);
						});
					} else if (this.enabled) {
						this.scheduleNext();
					}
				}
			},
		);
	}

	stop() {
		this.logger.log?.("[UsageWorker] Stopping scheduler...");

		if (this.timerId) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}
		this.nextRunAt = null;
		this.currentRun = null;
		this.queuedRun = null;
		if (this.activeRun) {
			this.activeRun.cancelled = true;
		}

		this.enabled = false;
		this.logger.log?.("[UsageWorker] Scheduler stopped");
	}

	getStatus() {
		const status = this.running
			? "running"
			: this.enabled
				? "idle"
				: "disabled";

		return {
			enabled: this.enabled,
			running: this.running,
			status,
			settings: this.settings,
			lastRunAt: this.lastRunAt,
			lastRunStats: this.lastRunStats,
			startedAt: this.startedAt,
			lastRun: this.lastRunStats
				? {
						...this.lastRunStats,
						finishedAt: this.lastRunAt,
					}
				: null,
			currentRun: this.currentRun,
			progress: this.currentRun?.progress || null,
			queuedRun: this.queuedRun,
			restartRequested: this.currentRun?.restartRequested === true,
			nextRunAt: this.nextRunAt,
		};
	}
}
