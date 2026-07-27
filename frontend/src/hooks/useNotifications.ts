import { useEffect, useRef, useState, useCallback } from "react";

export interface Notification {
  id: string;
  type: string;
  payload: unknown;
  receivedAt: string;
}

export interface UseNotificationsReturn {
  notifications: Notification[];
  latest: Notification | null;
  dismiss: () => void;
  connected: boolean;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [latest, setLatest] = useState<Notification | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const token = localStorage.getItem("sentinel_token");
    if (!token) return;

    const ws = new WebSocket(`ws://localhost:8085/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification: Notification = {
          id: crypto.randomUUID(),
          type: data.type || "unknown",
          payload: data,
          receivedAt: new Date().toISOString(),
        };
        setNotifications((prev) => [notification, ...prev].slice(0, 50));
        setLatest(notification);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const dismiss = useCallback(() => {
    setLatest(null);
  }, []);

  return { notifications, latest, dismiss, connected };
}
