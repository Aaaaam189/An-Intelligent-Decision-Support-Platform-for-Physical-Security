import apiClient from "./client";
import type { ChatRequest, ChatResponse } from "../types/assistant.types";

export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {
  const response = await apiClient.post<ChatResponse>(
    "/api/assistant/chat",
    request
  );
  return response.data;
}
