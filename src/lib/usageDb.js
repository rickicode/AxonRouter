// Shim → re-export from PostgreSQL DB layer (src/lib/db/)
export {
  statsEmitter, trackPendingRequest, getActiveRequests,
  saveRequestUsage, saveFailedRequest, getUsageHistory, getUsageStats, getChartData, getLast10Minutes,
  appendRequestLog, getRecentLogs,
  saveRequestDetail, getRequestDetails, getRequestDetailById, getFailureAnalytics, getComboAnalytics,
} from "@/lib/db/index.js";
