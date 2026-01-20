import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressEvent } from '../types';

type SSEStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

// Keep-alive interval in milliseconds (30 seconds)
const KEEP_ALIVE_INTERVAL = 30 * 1000;

interface UseSSEResult {
  events: ProgressEvent[];
  status: SSEStatus;
  downloadUrl: string | null;
  ragDownloadUrl: string | null;
  totalFiles: number;
  ragTotalFiles: number;
  connect: (url: string) => void;
  disconnect: () => void;
  reset: () => void;
}

// Ping the health endpoint to keep serverless backend warm
async function pingBackend(): Promise<void> {
  try {
    await fetch('/health', { method: 'GET' });
  } catch {
    // Silently ignore ping errors - the SSE connection will handle actual failures
  }
}

export function useSSE(): UseSSEResult {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<SSEStatus>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [ragDownloadUrl, setRagDownloadUrl] = useState<string | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [ragTotalFiles, setRagTotalFiles] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start keep-alive pings
  const startKeepAlive = useCallback(() => {
    // Clear any existing interval
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
    }
    // Ping immediately, then every KEEP_ALIVE_INTERVAL
    pingBackend();
    keepAliveIntervalRef.current = setInterval(pingBackend, KEEP_ALIVE_INTERVAL);
  }, []);

  // Stop keep-alive pings
  const stopKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    stopKeepAlive();
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setStatus('closed');
  }, [eventSource, stopKeepAlive]);

  const reset = useCallback(() => {
    stopKeepAlive();
    disconnect();
    setEvents([]);
    setStatus('idle');
    setDownloadUrl(null);
    setRagDownloadUrl(null);
    setTotalFiles(0);
    setRagTotalFiles(0);
  }, [disconnect, stopKeepAlive]);

  const connect = useCallback((url: string) => {
    // Close existing connection
    if (eventSource) {
      eventSource.close();
    }

    setStatus('connecting');
    setEvents([]);
    setDownloadUrl(null);
    setRagDownloadUrl(null);
    setTotalFiles(0);
    setRagTotalFiles(0);

    // Start keep-alive pings to keep serverless backend warm
    startKeepAlive();

    const es = new EventSource(url);

    es.onopen = () => {
      setStatus('connected');
    };

    es.onerror = () => {
      stopKeepAlive();
      setStatus('error');
      es.close();
    };

    // Handle different event types
    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ProgressEvent;
        setEvents((prev) => [...prev, data]);

        // Handle RAG completed event
        if (data.type === 'rag_completed' && data.data?.ragDownloadUrl) {
          setRagDownloadUrl(data.data.ragDownloadUrl);
          setRagTotalFiles(data.data.ragTotalFiles || 0);
          // Don't close connection - tests may still be generating
        }

        if (data.type === 'completed') {
          if (data.data?.downloadUrl) {
            setDownloadUrl(data.data.downloadUrl);
            setTotalFiles(data.data.totalFiles || 0);
          }
          // Also capture RAG data from completed event if present
          if (data.data?.ragDownloadUrl) {
            setRagDownloadUrl(data.data.ragDownloadUrl);
            setRagTotalFiles(data.data.ragTotalFiles || 0);
          }
          stopKeepAlive();
          setStatus('closed');
          es.close();
        }

        if (data.type === 'error') {
          stopKeepAlive();
          setStatus('error');
          es.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    es.addEventListener('progress', handleEvent);
    es.addEventListener('file_created', handleEvent);
    es.addEventListener('rag_completed', handleEvent);
    es.addEventListener('completed', handleEvent);
    es.addEventListener('error', handleEvent);

    setEventSource(es);

    return () => {
      es.close();
    };
  }, [eventSource, startKeepAlive, stopKeepAlive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopKeepAlive();
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource, stopKeepAlive]);

  return {
    events,
    status,
    downloadUrl,
    ragDownloadUrl,
    totalFiles,
    ragTotalFiles,
    connect,
    disconnect,
    reset,
  };
}
