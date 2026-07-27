import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { getRules, createRule, updateRule, deleteRule } from "../api/rules.api";
import type { Rule, CreateRuleRequest, UpdateRuleRequest } from "../types/rule.types";

export interface UseRulesReturn {
  rules: Rule[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useRules(): UseRulesReturn {
  const query = useQuery({
    queryKey: ["rules"],
    queryFn: getRules,
    staleTime: 60 * 1000, // 60 seconds
  });

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateRule(): UseMutationResult<Rule, Error, CreateRuleRequest> {
  const queryClient = useQueryClient();

  return useMutation<Rule, Error, CreateRuleRequest>({
    mutationFn: (data: CreateRuleRequest) => createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });
}

export function useUpdateRule(): UseMutationResult<
  Rule,
  Error,
  { id: string; data: UpdateRuleRequest }
> {
  const queryClient = useQueryClient();

  return useMutation<Rule, Error, { id: string; data: UpdateRuleRequest }>({
    mutationFn: ({ id, data }) => updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });
}

export function useDeleteRule(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });
}
