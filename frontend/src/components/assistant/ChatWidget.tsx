import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useAssistant } from "../../hooks/useAssistant";
import type { ChatMessage, Citation } from "../../types/assistant.types";
import {
  colors,
  fontFamily,
  fontSizes,
  borderRadius,
} from "../../constants/theme";
import Spinner from "../ui/Spinner";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function CitationLink({ citation }: { citation: Citation }) {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    backgroundColor: colors.white,
    border: `1px solid ${colors.darkGray}`,
    borderRadius: borderRadius.pill,
    fontSize: "12px",
    fontWeight: 600,
    color: colors.black,
    textDecoration: "none",
  };

  return (
    <Link to={citation.url} style={style} title={`Open incident ${citation.incidentId}`}>
      {citation.label}
    </Link>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  const rowStyle: CSSProperties = {
    display: "flex",
    justifyContent: isUser ? "flex-end" : "flex-start",
  };

  const bubbleStyle: CSSProperties = {
    maxWidth: "80%",
    padding: "10px 14px",
    borderRadius: borderRadius.card,
    backgroundColor: isUser ? colors.green : colors.lightGray,
    color: isUser ? colors.white : colors.black,
    fontSize: fontSizes.body,
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  const citationsStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  };

  return (
    <div style={rowStyle}>
      <div style={bubbleStyle}>
        <span>{message.content}</span>
        {message.citations && message.citations.length > 0 && (
          <div style={citationsStyle}>
            {message.citations.map((citation) => (
              <CitationLink key={citation.incidentId} citation={citation} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined
  );

  const assistant = useAssistant();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, assistant.isPending]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || assistant.isPending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    assistant.mutate(
      { question, conversationId },
      {
        onSuccess: (response) => {
          setConversationId(response.conversationId);
          const answerMessage: ChatMessage = {
            id: makeId(),
            role: "assistant",
            content: response.answer,
            citations: response.citations,
          };
          setMessages((prev) => [...prev, answerMessage]);
        },
      }
    );
  }

  const launcherStyle: CSSProperties = {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    width: "56px",
    height: "56px",
    borderRadius: borderRadius.pill,
    backgroundColor: colors.green,
    color: colors.white,
    border: "none",
    cursor: "pointer",
    fontSize: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    zIndex: 1000,
    fontFamily,
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        style={launcherStyle}
        onClick={() => setIsOpen(true)}
        aria-label="Open assistant chat"
      >
        💬
      </button>
    );
  }

  const panelStyle: CSSProperties = {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    width: "380px",
    maxWidth: "calc(100vw - 48px)",
    height: "560px",
    maxHeight: "calc(100vh - 48px)",
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    border: `1px solid ${colors.lightGray}`,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
    zIndex: 1000,
    fontFamily,
    overflow: "hidden",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: `1px solid ${colors.lightGray}`,
  };

  const headerTitleStyle: CSSProperties = {
    fontSize: fontSizes.sectionHeading,
    fontWeight: 600,
    color: colors.black,
    margin: 0,
  };

  const closeButtonStyle: CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "20px",
    color: colors.black,
    lineHeight: 1,
  };

  const listStyle: CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  };

  const emptyStyle: CSSProperties = {
    color: colors.darkGray,
    fontSize: fontSizes.body,
    textAlign: "center",
    marginTop: "auto",
    marginBottom: "auto",
  };

  const pendingRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: colors.darkGray,
    fontSize: fontSizes.body,
  };

  const errorStyle: CSSProperties = {
    margin: "0 16px",
    padding: "10px 12px",
    backgroundColor: "#FFECEB",
    color: colors.red,
    borderRadius: "8px",
    fontSize: "12px",
  };

  const formStyle: CSSProperties = {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderTop: `1px solid ${colors.lightGray}`,
  };

  const textInputStyle: CSSProperties = {
    flex: 1,
    padding: "10px 16px",
    borderRadius: borderRadius.pill,
    border: "1px solid transparent",
    backgroundColor: colors.lightGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    boxSizing: "border-box",
  };

  const sendButtonStyle: CSSProperties = {
    padding: "10px 20px",
    borderRadius: borderRadius.pill,
    backgroundColor: colors.green,
    color: colors.white,
    border: "none",
    fontFamily,
    fontWeight: 600,
    fontSize: fontSizes.body,
    cursor: input.trim() && !assistant.isPending ? "pointer" : "not-allowed",
    opacity: input.trim() && !assistant.isPending ? 1 : 0.6,
  };

  return (
    <section style={panelStyle} aria-label="Assistant chat">
      <header style={headerStyle}>
        <h3 style={headerTitleStyle}>Assistant</h3>
        <button
          type="button"
          style={closeButtonStyle}
          onClick={() => setIsOpen(false)}
          aria-label="Close assistant chat"
        >
          ×
        </button>
      </header>

      <div style={listStyle} ref={listRef}>
        {messages.length === 0 && !assistant.isPending && (
          <p style={emptyStyle}>
            Ask about incidents, e.g. "How many critical incidents happened
            today?"
          </p>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {assistant.isPending && (
          <div style={pendingRowStyle} role="status" aria-live="polite">
            <Spinner size={16} color={colors.green} />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {assistant.isError && (
        <p style={errorStyle} role="alert">
          Something went wrong. Please try again.
        </p>
      )}

      <form style={formStyle} onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your question…"
          style={textInputStyle}
          aria-label="Chat message"
          disabled={assistant.isPending}
        />
        <button
          type="submit"
          style={sendButtonStyle}
          disabled={!input.trim() || assistant.isPending}
        >
          Send
        </button>
      </form>
    </section>
  );
}
