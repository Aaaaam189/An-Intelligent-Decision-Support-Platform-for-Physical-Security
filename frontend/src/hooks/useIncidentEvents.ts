import { useQuery } from "@tanstack/react-query";
import { getIncidentEvents } from "../api/incidents.api";
import type { IncidentEvent } from "../types/incident.types";

export interface UseIncidentEventsReturn {
  events: IncidentEvent[];
  isLoading: boolean;
  error: string | null;
}

/**
 * The incident's timeline ("what happened"), oldest entry first. It refreshes
 * every few seconds because an open incident keeps receiving events.
 */
export function useIncidentEvents(id: string): UseIncidentEventsReturn {
  const query = useQuery({
    queryKey: ["incidents", id, "events"],
    queryFn: () => getIncidentEvents(id),
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
    enabled: !!id,
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
  };
}
