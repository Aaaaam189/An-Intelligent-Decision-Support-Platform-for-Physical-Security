import apiClient from "./client";
import type {
  Shift,
  CreateShiftRequest,
  CreateShiftBatchRequest,
} from "../types/shift.types";

export async function getShifts(): Promise<Shift[]> {
  const response = await apiClient.get<Shift[]>("/api/shifts");
  return response.data;
}

export async function getMyShifts(): Promise<Shift[]> {
  const response = await apiClient.get<Shift[]>("/api/shifts/mine");
  return response.data;
}

export async function createShift(data: CreateShiftRequest): Promise<Shift> {
  const response = await apiClient.post<Shift>("/api/shifts", data);
  return response.data;
}

export async function createShiftBatch(
  data: CreateShiftBatchRequest
): Promise<Shift[]> {
  const response = await apiClient.post<Shift[]>("/api/shifts/batch", data);
  return response.data;
}

export async function updateShift(
  id: string,
  data: Partial<CreateShiftRequest>
): Promise<Shift> {
  const response = await apiClient.put<Shift>(`/api/shifts/${id}`, data);
  return response.data;
}

export async function deleteShift(id: string): Promise<void> {
  await apiClient.delete(`/api/shifts/${id}`);
}
