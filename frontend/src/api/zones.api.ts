import apiClient from "./client";
import type { Zone } from "../types/zone.types";

export async function getZones(): Promise<Zone[]> {
  const response = await apiClient.get<Zone[]>("/api/zones");
  return response.data;
}

export async function createZone(name: string): Promise<Zone> {
  const response = await apiClient.post<Zone>("/api/zones", { name });
  return response.data;
}

export async function updateZone(id: string, name: string): Promise<Zone> {
  const response = await apiClient.put<Zone>(`/api/zones/${id}`, { name });
  return response.data;
}

export async function deleteZone(id: string): Promise<void> {
  await apiClient.delete(`/api/zones/${id}`);
}
