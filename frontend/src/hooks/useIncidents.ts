import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  getIncidents,
  getIncidentById,
  updateIncidentStatus,
  reassignIncident,
} from "../api/incidents.api";
import type { Incident, IncidentStatus } from "../types/incident.types";

export interface UseIncidentsReturn {
  incidents: Incident[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIncidents(): UseIncidentsReturn {
  const query = useQuery({
    queryKey: ["incidents"],
    queryFn: getIncidents,
    staleTime: 30 * 1000, // 30 seconds
  });

  return {
    incidents: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export interface UseIncidentReturn {
  incident: Incident | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIncident(id: string): UseIncidentReturn {
  const query = useQuery({
    queryKey: ["incidents", id],
    queryFn: () => getIncidentById(id),
    staleTime: 30 * 1000,
    enabled: !!id,
  });

  return {
    incident: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useUpdateIncidentStatus(): UseMutationResult<
  Incident,
  Error,
  { id: string; status: IncidentStatus }
> {
  const queryClient = useQueryClient();

  return useMutation<Incident, Error, { id: string; status: IncidentStatus }>({
    mutationFn: ({ id, status }) => updateIncidentStatus(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incidents", variables.id] });
    },
  });
}

export function useReassignIncident(): UseMutationResult<
  Incident,
  Error,
  { id: string; guardId: string }
> {
  const queryClient = useQueryClient();

  return useMutation<Incident, Error, { id: string; guardId: string }>({
    mutationFn: ({ id, guardId }) => reassignIncident(id, guardId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incidents", variables.id] });
    },
  });
}
