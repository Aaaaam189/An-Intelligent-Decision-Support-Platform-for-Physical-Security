export type RulePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Rule {
  id: string;
  name: string;
  condition: string;
  resultingPriority: RulePriority;
  createdAt: string;
}

export interface CreateRuleRequest {
  name: string;
  condition: string;
  resultingPriority: RulePriority;
}

export interface UpdateRuleRequest {
  name?: string;
  condition?: string;
  resultingPriority?: RulePriority;
}
