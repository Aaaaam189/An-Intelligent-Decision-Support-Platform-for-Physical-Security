export interface AnalyticsSummary {
  totalIncidents: number;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  byZone: Record<string, number>;
  avgResolutionSeconds: number | null;
}

export interface CriticalAlert {
  id: string;
  incidentId: string;
  zoneId: string;
  priority: string;
  message: string;
  createdAt: string;
}

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  priority?: string;
  zoneId?: string;
}
