import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsSummary,
  getAnalyticsToday,
  getAnalyticsAlerts,
  getAlerts,
} from "../api/analytics.api";
import type {
  AnalyticsSummary,
  AnalyticsFilters,
  CriticalAlert,
} from "../types/analytics.types";

export interface UseAnalyticsSummaryReturn {
  summary: AnalyticsSummary | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAnalyticsSummary(
  filters?: AnalyticsFilters
): UseAnalyticsSummaryReturn {
  const query = useQuery({
    queryKey: ["analytics", "summary", filters ?? {}],
    queryFn: () => getAnalyticsSummary(filters),
    staleTime: 60 * 1000, // 60 seconds
  });

  return {
    summary: query.data,
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export interface UseAnalyticsTodayReturn {
  incidentsToday: number | undefined;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAnalyticsToday(): UseAnalyticsTodayReturn {
  const query = useQuery({
    queryKey: ["analytics", "today"],
    queryFn: getAnalyticsToday,
    staleTime: 60 * 1000,
  });

  return {
    incidentsToday: query.data?.incidentsToday,
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export interface UseAnalyticsAlertsReturn {
  alerts: CriticalAlert[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAnalyticsAlerts(): UseAnalyticsAlertsReturn {
  const query = useQuery({
    queryKey: ["analytics", "alerts"],
    queryFn: getAnalyticsAlerts,
    staleTime: 30 * 1000,
  });

  return {
    alerts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export interface UseAlertsReturn {
  alerts: CriticalAlert[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAlerts(): UseAlertsReturn {
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    alerts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

