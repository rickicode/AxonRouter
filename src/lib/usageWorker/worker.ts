// Usage Worker - Background process that runs the scheduler

import { instrumentUsageWorker, shutdownOtel } from "../observability/otel.ts";
import { UsageScheduler } from "./scheduler.ts";

const channel = process.send ? process : null;
const scheduler = new UsageScheduler({
	onStatusChange: (status) => {
		channel?.send?.({
			type: "status_update",
			status,
		});
	},
});

function serializeError(error) {
	return {
		message: error?.message || String(error),
		stack: error?.stack || null,
	};
}

function sendStatusUpdate(extra = {}) {
	channel?.send?.({
		type: "status_update",
		status: {
			...scheduler.getStatus(),
			...extra,
		},
	});
}

process.on("unhandledRejection", (error) => {
	console.error("[UsageWorker] Unhandled rejection:", error);
	sendStatusUpdate({ workerError: serializeError(error).message });
});

process.on("uncaughtException", (error) => {
	console.error("[UsageWorker] Uncaught exception:", error);
	sendStatusUpdate({ workerError: serializeError(error).message });
});

// Handle IPC messages from parent process
type WorkerMessage = {
	command?: "start" | "stop" | "status" | "runNow" | "runAllNow";
	requestId?: string;
	reason?: string;
};

process.on(
	"message",
	async (
		message: WorkerMessage | string | number | boolean | object | null,
	) => {
		const payload: WorkerMessage =
			message && typeof message === "object" ? (message as WorkerMessage) : {};
		const { command, requestId } = payload;

		try {
			const result = await instrumentUsageWorker(
				"command",
				{
					"usage_worker.command": command || "unknown",
					"usage_worker.request_id": requestId || "",
					"usage_worker.reason": payload.reason || "",
				},
				async () => {
					switch (command) {
						case "start":
							await scheduler.start();
							sendStatusUpdate();
							return { started: true };

						case "stop":
							scheduler.stop();
							sendStatusUpdate();
							return { stopped: true };

						case "status":
							return scheduler.getStatus();

						case "runNow": {
							const batchResult = await scheduler.runBatch(
								payload.reason || "manual",
							);
							sendStatusUpdate();
							return batchResult;
						}

						case "runAllNow": {
							const fullResult = scheduler.requestFullRefresh(
								payload.reason || "manual_full_refresh",
							);
							sendStatusUpdate();
							return fullResult;
						}

						default:
							throw new Error(`Unknown command: ${command}`);
					}
				},
			);

			channel?.send?.({
				type: "result",
				requestId,
				result,
			});
		} catch (error) {
			channel?.send?.({
				type: "error",
				requestId,
				error: error?.message || String(error),
			});
		}
	},
);

async function boot() {
	try {
		await instrumentUsageWorker("boot", {}, async () => {
			await scheduler.loadSettings();
			sendStatusUpdate();
			channel?.send?.({ type: "ready" });
			scheduler
				.start()
				.then(() => sendStatusUpdate())
				.catch((error) => {
					console.error("[UsageWorker] Scheduler startup failed:", error);
					sendStatusUpdate({ workerError: serializeError(error).message });
				});
		});
	} catch (error) {
		console.error("[UsageWorker] Scheduler settings load failed:", error);
		channel?.send?.({ type: "ready" });
		sendStatusUpdate({
			status: "error",
			workerError: serializeError(error).message,
		});
	}
}

process.once("SIGTERM", () => {
	shutdownOtel().finally(() => process.exit(0));
});

boot();
