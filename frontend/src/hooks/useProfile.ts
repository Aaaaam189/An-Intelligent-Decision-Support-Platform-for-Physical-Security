import {
  useMutation,
  type UseMutationResult,
} from "@tanstack/react-query";
import { changePassword } from "../api/auth.api";
import type { ChangePasswordRequest } from "../types/auth.types";

export function useChangePassword(): UseMutationResult<
  void,
  Error,
  ChangePasswordRequest
> {
  return useMutation<void, Error, ChangePasswordRequest>({
    mutationFn: (data: ChangePasswordRequest) => changePassword(data),
  });
}
