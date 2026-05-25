import { getChartDataFromDb, getUsageStatsFromDb } from "@/lib/usageDb/queries/index";
import { getLiveActivity } from "./usageHistory";

export async function getUsageStats(period = "all") {
  const liveActivity = await getLiveActivity();
  return getUsageStatsFromDb(period, liveActivity);
}

export async function getChartData(period = "7d") {
  return getChartDataFromDb(period);
}
