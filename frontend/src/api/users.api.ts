import apiClient from "./client";
import type { User, CreateUserRequest, UpdateUserRequest } from "../types/user.types";

export async function getUsers(): Promise<User[]> {
  const response = await apiClient.get<User[]>("/api/auth/users");
  return response.data;
}

export async function getActiveUsers(): Promise<User[]> {
  const response = await apiClient.get<User[]>("/api/auth/users/active");
  return response.data;
}

export async function getInactiveUsers(): Promise<User[]> {
  const response = await apiClient.get<User[]>("/api/auth/users/inactive");
  return response.data;
}

export async function createUser(data: CreateUserRequest): Promise<User> {
  const response = await apiClient.post<User>("/api/auth/users", data);
  return response.data;
}

export async function updateUser(id: string, data: UpdateUserRequest): Promise<User> {
  const response = await apiClient.put<User>(`/api/auth/users/${id}`, data);
  return response.data;
}

export async function deactivateUser(id: string): Promise<void> {
  await apiClient.patch(`/api/auth/users/${id}/deactivate`);
}

export async function reactivateUser(id: string): Promise<void> {
  await apiClient.patch(`/api/auth/users/${id}/reactivate`);
}
