import apiClient from "./client";
import type { Incident, IncidentStatus } from "../types/incident.types";

export async function getIncidents(): Promise<Incident[]> {
  const response = await apiClient.get<Incident[]>("/api/incidents");
  return response.data;
}

export async function getIncidentById(id: string): Promise<Incident> {
  const response = await apiClient.get<Incident>(`/api/incidents/${id}`);
  return response.data;
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus
): Promise<Incident> {
  const response = await apiClient.patch<Incident>(
    `/api/incidents/${id}/status`,
    { status }
  );
  return response.data;
}

export async function reassignIncident(
  id: string,
  guardId: string
): Promise<Incident> {
  const response = await apiClient.patch<Incident>(
    `/api/incidents/${id}/reassign`,
    { guardId }
  );
  return response.data;
}
