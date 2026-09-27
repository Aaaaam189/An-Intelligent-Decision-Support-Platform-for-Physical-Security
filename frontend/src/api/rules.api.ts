import apiClient from "./client";
import type {
  Rule,
  CreateRuleRequest,
  UpdateRuleRequest,
} from "../types/rule.types";

export async function getRules(): Promise<Rule[]> {
  const response = await apiClient.get<Rule[]>("/api/rules");
  return response.data;
}

export async function createRule(data: CreateRuleRequest): Promise<Rule> {
  const response = await apiClient.post<Rule>("/api/rules", data);
  return response.data;
}

export async function updateRule(
  id: string,
  data: UpdateRuleRequest
): Promise<Rule> {
  const response = await apiClient.put<Rule>(`/api/rules/${id}`, data);
  return response.data;
}

export async function setRuleEnabled(
  id: string,
  enabled: boolean
): Promise<Rule> {
  const response = await apiClient.patch<Rule>(`/api/rules/${id}/enabled`, {
    enabled,
  });
  return response.data;
}

export async function deleteRule(id: string): Promise<void> {
  await apiClient.delete(`/api/rules/${id}`);
}
