import { useState, useRef, useCallback, useEffect } from 'react';
import { WSMessageFromServer, ReviewSchema } from '../types/ws';

interface UseWebSocketProps {
  url: string;
  onChunk: (chunk: string) => void;
  onComplete: (review: ReviewSchema) => void;
  onError: (error: string) => void;
  onConnected?: () => void;
}

export function useWebSocket({ url, onChunk, onComplete, onError, onConnected }: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsLeft = useRef(3);
  
  const lastRequestRef = useRef<string | null>(null);

  const connect = useCallback((requestPayload?: string) => {
    if (requestPayload) {
      lastRequestRef.current = requestPayload;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN || isConnecting) {
      if (wsRef.current?.readyState === WebSocket.OPEN && requestPayload) {
          wsRef.current.send(requestPayload);
      }
      return;
    }

    setIsConnecting(true);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      reconnectAttemptsLeft.current = 3; 
      
      if (onConnected) onConnected();

      if (lastRequestRef.current) {
        ws.send(lastRequestRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessageFromServer;
        if (msg.type === 'chunk') {
          const piece = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data);
          onChunk(piece);
        } else if (msg.type === 'complete') {
          onComplete(msg.review);
          lastRequestRef.current = null;
          ws.close();
        } else if (msg.type === 'error') {
          onError(msg.message);
          lastRequestRef.current = null;
          ws.close();
        } else if (msg.type === 'connected') {
          // Backend connection confirmation
        }
      } catch (err: unknown) {
        console.error('WS message parse err', err);
      }
    };

    ws.onerror = () => {
       // We let onclose handle the reconnect logic
    };
    
    ws.onclose = () => {
      setIsConnecting(false);
      
      if (lastRequestRef.current && reconnectAttemptsLeft.current > 0) {
         reconnectAttemptsLeft.current--;
         const backoffTime = (4 - reconnectAttemptsLeft.current) * 1000;
         console.warn(`WS connection dropped. Reconnecting in ${backoffTime}ms...`);
         
         reconnectTimeoutRef.current = setTimeout(() => {
             connect();
         }, backoffTime);
      } else if (lastRequestRef.current) {
         onError("Connection lost. Too many reconnect attempts.");
         lastRequestRef.current = null;
      }
    };
  }, [url, onChunk, onComplete, onError, onConnected, isConnecting]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    lastRequestRef.current = null;
    reconnectAttemptsLeft.current = 0;
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
       if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
    }
  }, []);

  return { connect, disconnect, isConnecting };
}
