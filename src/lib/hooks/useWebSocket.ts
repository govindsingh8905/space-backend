'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useOrbitalStore } from '@/lib/store/orbitalStore';
import type { DebrisObject, ConjunctionEvent } from '@/lib/store/orbitalStore';

type WsMessage =
  | { type: 'debris_update';    payload: Pick<DebrisObject, 'id' | 'x' | 'y' | 'z'>[] }
  | { type: 'conjunction_alert'; payload: ConjunctionEvent }
  | { type: 'full_refresh';     payload: DebrisObject[] }
  | { type: 'ping' };

export function useWebSocket(url: string = 'ws://localhost:8000/ws/debris') {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const { setWsConnected, updateDebrisPositions, setConjunctions, setDebrisField } = useOrbitalStore();

  const connect = useCallback(() => {
    // In dev/demo mode without a backend, we skip real WS
    if (typeof window === 'undefined') return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to orbital data stream');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          switch (msg.type) {
            case 'debris_update':
              updateDebrisPositions(msg.payload);
              break;
            case 'full_refresh':
              setDebrisField(msg.payload);
              break;
            case 'conjunction_alert':
              setConjunctions([msg.payload]);
              break;
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
          }
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('[WS] Disconnected. Reconnecting in 3s...');
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        ws.close();
      };
    } catch (_) {
      // Backend not available (demo mode)
      console.log('[WS] Backend not available – running in demo mode');
    }
  }, [url, setWsConnected, updateDebrisPositions, setConjunctions, setDebrisField]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectRef.current);
    wsRef.current?.close();
  }, []);

  const sendFastForwardRequest = useCallback((hours: number, speed: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'fast_forward', hours, speed }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { sendFastForwardRequest, disconnect };
}
