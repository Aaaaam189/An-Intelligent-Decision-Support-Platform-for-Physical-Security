import apiClient from "./client";
import type {
  Camera,
  CreateCameraRequest,
  UpdateCameraRequest,
} from "../types/camera.types";

export async function getCameras(): Promise<Camera[]> {
  const response = await apiClient.get<Camera[]>("/api/cameras");
  return response.data;
}

export async function getCamera(id: string): Promise<Camera> {
  const response = await apiClient.get<Camera>(`/api/cameras/${id}`);
  return response.data;
}

export async function createCamera(data: CreateCameraRequest): Promise<Camera> {
  const response = await apiClient.post<Camera>("/api/cameras", data);
  return response.data;
}

export async function updateCamera(
  id: string,
  data: UpdateCameraRequest
): Promise<Camera> {
  const response = await apiClient.put<Camera>(`/api/cameras/${id}`, data);
  return response.data;
}

export async function deleteCamera(id: string): Promise<void> {
  await apiClient.delete(`/api/cameras/${id}`);
}
