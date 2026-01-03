import { useState, useEffect, useCallback } from 'react';
import type { ProgressEvent } from '../types';

type SSEStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface UseSSEResult {
  events: ProgressEvent[];
  status: SSEStatus;
  downloadUrl: string | null;
  totalFiles: number;
  connect: (url: string) => void;
  disconnect: () => void;
  reset: () => void;
}

export function useSSE(): UseSSEResult {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<SSEStatus>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [totalFiles, setTotalFiles] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setStatus('closed');
  }, [eventSource]);

  const reset = useCallback(() => {
    disconnect();
    setEvents([]);
    setStatus('idle');
    setDownloadUrl(null);
    setTotalFiles(0);
  }, [disconnect]);

  const connect = useCallback((url: string) => {
    // Close existing connection
    if (eventSource) {
      eventSource.close();
    }

    setStatus('connecting');
    setEvents([]);
    setDownloadUrl(null);

    const es = new EventSource(url);

    es.onopen = () => {
      setStatus('connected');
    };

    es.onerror = () => {
      setStatus('error');
      es.close();
    };

    // Handle different event types
    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ProgressEvent;
        setEvents((prev) => [...prev, data]);

        if (data.type === 'completed' && data.data?.downloadUrl) {
          setDownloadUrl(data.data.downloadUrl);
          setTotalFiles(data.data.totalFiles || 0);
          setStatus('closed');
          es.close();
        }

        if (data.type === 'error') {
          setStatus('error');
          es.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    es.addEventListener('progress', handleEvent);
    es.addEventListener('file_created', handleEvent);
    es.addEventListener('completed', handleEvent);
    es.addEventListener('error', handleEvent);

    setEventSource(es);

    return () => {
      es.close();
    };
  }, [eventSource]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  return {
    events,
    status,
    downloadUrl,
    totalFiles,
    connect,
    disconnect,
    reset,
  };
}
