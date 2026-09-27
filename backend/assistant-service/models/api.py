"""Pydantic models for the assistant-service HTTP API contract.

These define the request/response shapes for the chat endpoint exposed behind
the api-gateway (``POST /api/assistant/chat``). The wire format is camelCase to
match the rest of the platform's JSON APIs and the frontend chat widget.

    Request:  { "question": str (non-empty), "conversationId": str | null }
    Response: { "answer": str, "citations": Citation[], "conversationId": str }
    Citation: { "incidentId": str, "label": str, "url": str }

Requirements: 11.1 (chat request), 11.4 (chat response), 8.5 (link-renderable
citations).
"""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Citation(BaseModel):
    """A source incident returned alongside an answer.

    The frontend renders each Citation as a clickable link to the incident
    detail page, so it exposes both an ``incidentId`` and a ready-to-use
    ``url`` (Req 8.5, 13.3).
    """

    model_config = ConfigDict(populate_by_name=True)

    incident_id: str = Field(alias="incidentId")
    label: str = Field(alias="label")
    url: str = Field(alias="url")


class ChatRequest(BaseModel):
    """Body of a chat request (Req 11.1).

    ``question`` must be non-empty (whitespace-only is rejected). The optional
    ``conversationId`` links a follow-up to an existing Conversation_Memory; a
    missing/expired id causes the service to mint a fresh conversation.
    """

    model_config = ConfigDict(populate_by_name=True)

    question: str = Field(alias="question", min_length=1)
    conversation_id: Optional[str] = Field(default=None, alias="conversationId")

    @field_validator("question")
    @classmethod
    def _question_not_blank(cls, value: str) -> str:
        """Reject empty or whitespace-only questions (Req 11.1)."""

        stripped = value.strip()
        if not stripped:
            raise ValueError("question must not be empty")
        return stripped


class ChatResponse(BaseModel):
    """Body of a successful chat response (Req 11.4).

    Always carries the answer text, the list of Citations, and the
    (possibly newly minted) conversation identifier.
    """

    model_config = ConfigDict(populate_by_name=True)

    answer: str = Field(alias="answer")
    citations: List[Citation] = Field(default_factory=list, alias="citations")
    conversation_id: str = Field(alias="conversationId")
