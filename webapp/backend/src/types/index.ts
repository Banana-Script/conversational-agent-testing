export type Provider = 'elevenlabs' | 'vapi' | 'viernes';

export interface ContextFile {
  name: string;
  content: string;
}

export interface GenerateRequest {
  content?: string;  // DEPRECATED - mantener para compatibilidad
  files?: ContextFile[];  // NUEVO - archivos de contexto
  contentType?: 'prompt' | 'specification';
  provider: Provider;
  organizationId?: number;
  agentId?: number | string;  // number para Viernes, string para ElevenLabs
  options?: {
    testCount?: number;
    priority?: 'smoke' | 'full';
  };
}

export interface GenerateResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  sseEndpoint: string;
}

export interface ProgressEvent {
  type: 'progress' | 'file_created' | 'completed' | 'error';
  message: string;
  timestamp: string;
  data?: {
    filename?: string;
    content?: string;
    totalFiles?: number;
    currentFile?: number;
    downloadUrl?: string;
    debugInfo?: string;
  };
}

export interface Job {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  provider: Provider;
  content?: string;  // DEPRECATED
  contextFiles?: ContextFile[];  // NUEVO - archivos de contexto subidos
  organizationId?: number;
  agentId?: number | string;  // number para Viernes, string para ElevenLabs
  options?: {
    testCount?: number;
    priority?: 'smoke' | 'full';
  };
  createdAt: Date;
  completedAt?: Date;
  generatedFiles: Array<{ name: string; content: string }>;  // Renombrado para claridad
  zipPath?: string;
  error?: string;
}
