import { useMutation } from "@tanstack/react-query";
import { login as loginApi } from "../api/auth.api";
import { extractRoleFromJWT } from "../utils/jwt";
import type { LoginRequest } from "../types/auth.types";

export interface UseLoginReturn {
  login: (credentials: LoginRequest) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useLogin(): UseLoginReturn {
  const mutation = useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await loginApi(credentials);
      return response;
    },
    onSuccess: (data) => {
      // Store token in localStorage
      localStorage.setItem("sentinel_token", data.token);

      // Extract role from JWT and store it
      const role = extractRoleFromJWT(data.token);
      localStorage.setItem("sentinel_role", role);

      // Store user ID
      localStorage.setItem("sentinel_uid", data.user.id);

      // Store user info for profile display
      localStorage.setItem("sentinel_fullName", data.user.fullName);
      localStorage.setItem("sentinel_email", data.user.email);
    },
  });

  const login = async (credentials: LoginRequest): Promise<void> => {
    await mutation.mutateAsync(credentials);
  };

  return {
    login,
    isLoading: mutation.isPending,
    error: mutation.error ? mutation.error.message : null,
  };
}
