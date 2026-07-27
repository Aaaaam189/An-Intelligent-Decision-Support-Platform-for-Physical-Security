import apiClient from "./client";
import type {
  LoginRequest,
  LoginResponse,
  ForgotPasswordRequest,
  VerifyResetCodeRequest,
  VerifyResetCodeResponse,
  ResetPasswordRequest,
  ChangePasswordRequest,
} from "../types/auth.types";

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>("/api/auth/login", data);
  return response.data;
}

export async function forgotPassword(data: ForgotPasswordRequest): Promise<void> {
  await apiClient.post("/api/auth/forgot-password", data);
}

export async function verifyResetCode(
  data: VerifyResetCodeRequest
): Promise<VerifyResetCodeResponse> {
  const response = await apiClient.post<VerifyResetCodeResponse>(
    "/api/auth/verify-reset-code",
    data
  );
  return response.data;
}

export async function resetPassword(data: ResetPasswordRequest): Promise<void> {
  await apiClient.post("/api/auth/reset-password", data);
}

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await apiClient.put("/api/auth/change-password", data);
}
