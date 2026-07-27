import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  getUsers,
  getActiveUsers,
  getInactiveUsers,
  createUser as createUserApi,
  updateUser as updateUserApi,
  deactivateUser as deactivateUserApi,
  reactivateUser as reactivateUserApi,
} from "../api/users.api";
import type { User, CreateUserRequest, UpdateUserRequest } from "../types/user.types";

export interface UseUsersReturn {
  users: User[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUsers(): UseUsersReturn {
  const query = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    staleTime: 60 * 1000, // 60 seconds
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useActiveUsers(): UseUsersReturn {
  const query = useQuery({
    queryKey: ["users", "active"],
    queryFn: getActiveUsers,
    staleTime: 60 * 1000,
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useInactiveUsers(): UseUsersReturn {
  const query = useQuery({
    queryKey: ["users", "inactive"],
    queryFn: getInactiveUsers,
    staleTime: 60 * 1000,
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateUser(): UseMutationResult<User, Error, CreateUserRequest> {
  const queryClient = useQueryClient();

  return useMutation<User, Error, CreateUserRequest>({
    mutationFn: (data) => createUserApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser(): UseMutationResult<
  User,
  Error,
  { id: string; data: UpdateUserRequest }
> {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { id: string; data: UpdateUserRequest }>({
    mutationFn: ({ id, data }) => updateUserApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeactivateUser(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => deactivateUserApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useReactivateUser(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => reactivateUserApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
