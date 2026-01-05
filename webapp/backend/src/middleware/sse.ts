import { Response } from 'express';
import type { ProgressEvent } from '../types/index.js';

// Heartbeat interval in milliseconds (15 seconds)
const HEARTBEAT_INTERVAL = 15000;

export class SSEConnection {
  private res: Response;
  private closed = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(res: Response) {
    this.res = res;
    this.setupHeaders();
    this.setupCleanup();
    this.startHeartbeat();
  }

  private setupHeaders(): void {
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders();
  }

  private setupCleanup(): void {
    this.res.on('close', () => {
      this.stopHeartbeat();
      this.closed = true;
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.closed) {
        try {
          // SSE comment (ignored by client but keeps connection alive)
          this.res.write(': heartbeat\n\n');
        } catch (error) {
          // Connection likely closed, clean up
          this.stopHeartbeat();
          this.closed = true;
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  send(event: ProgressEvent): void {
    if (this.closed) return;

    const eventWithTimestamp = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    this.res.write(`event: ${event.type}\n`);
    this.res.write(`data: ${JSON.stringify(eventWithTimestamp)}\n\n`);
  }

  sendProgress(message: string): void {
    this.send({ type: 'progress', message, timestamp: new Date().toISOString() });
  }

  sendFileCreated(filename: string, content?: string, current?: number, total?: number): void {
    this.send({
      type: 'file_created',
      message: `Archivo creado: ${filename}`,
      timestamp: new Date().toISOString(),
      data: {
        filename,
        content,
        currentFile: current,
        totalFiles: total,
      },
    });
  }

  sendCompleted(downloadUrl: string, totalFiles: number): void {
    this.send({
      type: 'completed',
      message: `Generacion completada: ${totalFiles} tests`,
      timestamp: new Date().toISOString(),
      data: {
        downloadUrl,
        totalFiles,
      },
    });
  }

  sendError(message: string): void {
    this.send({ type: 'error', message, timestamp: new Date().toISOString() });
  }

  close(): void {
    if (!this.closed) {
      this.stopHeartbeat();
      this.res.end();
      this.closed = true;
    }
  }

  isClosed(): boolean {
    return this.closed;
  }
}

// Store for active SSE connections per job
export const sseConnections = new Map<string, SSEConnection[]>();

export function addConnection(jobId: string, connection: SSEConnection): void {
  const connections = sseConnections.get(jobId) || [];
  connections.push(connection);
  sseConnections.set(jobId, connections);
}

export function broadcastToJob(jobId: string, event: ProgressEvent): void {
  const connections = sseConnections.get(jobId) || [];
  connections.forEach((conn) => {
    if (!conn.isClosed()) {
      conn.send(event);
    }
  });
  // Clean up closed connections
  sseConnections.set(
    jobId,
    connections.filter((conn) => !conn.isClosed())
  );
}

export function removeJobConnections(jobId: string): void {
  const connections = sseConnections.get(jobId) || [];
  connections.forEach((conn) => conn.close());
  sseConnections.delete(jobId);
}
