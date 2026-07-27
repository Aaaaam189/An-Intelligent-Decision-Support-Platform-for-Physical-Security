import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { getZones, createZone, updateZone, deleteZone } from "../api/zones.api";
import type { Zone } from "../types/zone.types";

export interface UseZonesReturn {
  zones: Zone[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useZones(): UseZonesReturn {
  const query = useQuery({
    queryKey: ["zones"],
    queryFn: getZones,
    staleTime: 60 * 1000, // 60 seconds
  });

  return {
    zones: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateZone(): UseMutationResult<Zone, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<Zone, Error, string>({
    mutationFn: (name: string) => createZone(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
  });
}

export function useUpdateZone(): UseMutationResult<
  Zone,
  Error,
  { id: string; name: string }
> {
  const queryClient = useQueryClient();

  return useMutation<Zone, Error, { id: string; name: string }>({
    mutationFn: ({ id, name }) => updateZone(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
  });
}

export function useDeleteZone(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteZone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
  });
}
