export type ChatRole = "user" | "assistant";

export interface Citation {
  incidentId: string;
  label: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  citations?: Citation[];
}

export interface ChatRequest {
  question: string;
  conversationId?: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  conversationId: string;
}
