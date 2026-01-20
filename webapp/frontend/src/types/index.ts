export type Provider = 'elevenlabs' | 'vapi' | 'viernes';

export interface ContextFile {
  name: string;
  content: string;
}

export interface Organization {
  id: number;
  name: string;
}

export interface ChatAgent {
  id: number;
  name: string;
  organization_id: number;
}

export interface ElevenLabsAgent {
  agent_id: string;
  name: string;
  created_at?: string;
}

export type JobMode = 'tests-only' | 'rag-only' | 'rag-then-tests';

export interface ProgressEvent {
  type: 'progress' | 'file_created' | 'completed' | 'error' | 'rag_completed';
  message: string;
  timestamp: string;
  data?: {
    filename?: string;
    content?: string;
    totalFiles?: number;
    currentFile?: number;
    downloadUrl?: string;
    ragDownloadUrl?: string;
    ragTotalFiles?: number;
    debugInfo?: string;
    // Ralph iteration data
    iteration?: number;
    maxIterations?: number;
    tasksCompleted?: number;
    testsGenerated?: number;
    workType?: string;
  };
}

export interface GenerateResponse {
  jobId: string;
  status: string;
  sseEndpoint: string;
}

export interface JobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  filesCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
  downloadUrl?: string;
}
