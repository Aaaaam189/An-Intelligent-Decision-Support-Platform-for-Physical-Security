import apiClient from "./client";
import type {
  AnalyticsSummary,
  AnalyticsFilters,
  CriticalAlert,
} from "../types/analytics.types";

export async function getAnalyticsSummary(
  filters?: AnalyticsFilters
): Promise<AnalyticsSummary> {
  const params: Record<string, string> = {};
  if (filters?.startDate) params.startDate = filters.startDate;
  if (filters?.endDate) params.endDate = filters.endDate;
  if (filters?.priority) params.priority = filters.priority;
  if (filters?.zoneId) params.zoneId = filters.zoneId;

  const response = await apiClient.get<AnalyticsSummary>(
    "/api/analytics/summary",
    { params }
  );
  return response.data;
}

export async function getAnalyticsToday(): Promise<{ incidentsToday: number }> {
  const response = await apiClient.get<{ incidentsToday: number }>(
    "/api/analytics/today"
  );
  return response.data;
}

export async function getAnalyticsAlerts(): Promise<CriticalAlert[]> {
  const response = await apiClient.get<CriticalAlert[]>(
    "/api/analytics/alerts"
  );
  return response.data;
}

export async function getAlerts(): Promise<CriticalAlert[]> {
  const response = await apiClient.get<CriticalAlert[]>(
    "/api/analytics/alerts"
  );
  return response.data;
}

