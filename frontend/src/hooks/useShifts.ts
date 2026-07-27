import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  getShifts,
  getMyShifts,
  createShift,
  createShiftBatch,
  updateShift,
  deleteShift,
} from "../api/shifts.api";
import type {
  Shift,
  CreateShiftRequest,
  CreateShiftBatchRequest,
} from "../types/shift.types";

export interface UseShiftsReturn {
  shifts: Shift[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useShifts(): UseShiftsReturn {
  const query = useQuery({
    queryKey: ["shifts"],
    queryFn: getShifts,
    staleTime: 30 * 1000,
  });

  return {
    shifts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useMyShifts(): UseShiftsReturn {
  const query = useQuery({
    queryKey: ["shifts", "mine"],
    queryFn: getMyShifts,
    staleTime: 30 * 1000,
  });

  return {
    shifts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateShift(): UseMutationResult<
  Shift,
  Error,
  CreateShiftRequest
> {
  const queryClient = useQueryClient();

  return useMutation<Shift, Error, CreateShiftRequest>({
    mutationFn: (data) => createShift(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useCreateShiftBatch(): UseMutationResult<
  Shift[],
  Error,
  CreateShiftBatchRequest
> {
  const queryClient = useQueryClient();

  return useMutation<Shift[], Error, CreateShiftBatchRequest>({
    mutationFn: (data) => createShiftBatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useUpdateShift(): UseMutationResult<
  Shift,
  Error,
  { id: string; data: Partial<CreateShiftRequest> }
> {
  const queryClient = useQueryClient();

  return useMutation<Shift, Error, { id: string; data: Partial<CreateShiftRequest> }>({
    mutationFn: ({ id, data }) => updateShift(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useDeleteShift(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteShift(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}
