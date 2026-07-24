import { useEffect, useRef, useState } from "react";

import { API_URL } from "../services/api";
import { useAuth } from "../auth/AuthContext";

const RECONNECT_DELAY_MS = 3000;

function toWebSocketUrl(token) {
  const url = new URL(`${API_URL}/ws/notifications`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Live push notifications (low stock, new sale invoices, payments received)
 * over a single shared WebSocket connection. Falls back silently to nothing
 * if the socket can't connect - callers should keep using polled data as
 * their source of truth and treat this purely as a live top-up.
 */
export function useLiveNotifications() {
  const { token } = useAuth();
  const [events, setEvents] = useState([]);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    if (!token) return undefined;

    let closedByEffect = false;

    function connect() {
      const socket = new WebSocket(toWebSocketUrl(token));
      socketRef.current = socket;

      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data);
          setEvents((current) => [event, ...current].slice(0, 20));
        } catch {
          // Ignore malformed frames.
        }
      };

      socket.onclose = () => {
        if (!closedByEffect) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      closedByEffect = true;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [token]);

  return events;
}
