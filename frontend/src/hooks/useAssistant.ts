import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { sendChatMessage } from "../api/assistant.api";
import type { ChatRequest, ChatResponse } from "../types/assistant.types";

export function useAssistant(): UseMutationResult<
  ChatResponse,
  Error,
  ChatRequest
> {
  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: sendChatMessage,
  });
}
