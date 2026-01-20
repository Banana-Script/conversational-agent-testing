export type Provider = 'elevenlabs' | 'vapi' | 'viernes';

// RAG Mode Types
export type JobMode = 'tests-only' | 'rag-only' | 'rag-then-tests';

export interface RagFile {
  path: string;      // e.g., '01-empresa/general.md'
  content: string;
}

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
  mode?: JobMode;  // NEW - RAG mode selection
  options?: {
    testCount?: number;
    priority?: 'smoke' | 'full';
    useRalph?: boolean;      // Enable iterative Ralph mode
    maxIterations?: number;  // Max Ralph loops (default: 10)
  };
}

export interface GenerateResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  sseEndpoint: string;
}

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
    debugInfo?: string;
    // RAG-specific fields
    ragDownloadUrl?: string;
    ragTotalFiles?: number;
    // Ralph iterative mode fields
    iteration?: number;
    maxIterations?: number;
    tasksCompleted?: number;
    testsGenerated?: number;
    workType?: string;
  };
}

export interface Job {
  id: string;
  status: 'queued' | 'preprocessing' | 'processing' | 'completed' | 'failed';
  provider: Provider;
  mode: JobMode;  // NEW - RAG mode
  content?: string;  // DEPRECATED
  contextFiles?: ContextFile[];  // NUEVO - archivos de contexto subidos
  organizationId?: number;
  agentId?: number | string;  // number para Viernes, string para ElevenLabs
  options?: {
    testCount?: number;
    priority?: 'smoke' | 'full';
    useRalph?: boolean;
    maxIterations?: number;
  };
  createdAt: Date;
  completedAt?: Date;
  generatedFiles: Array<{ name: string; content: string }>;  // Renombrado para claridad
  zipPath?: string;
  error?: string;
  // RAG-specific fields
  ragFiles?: RagFile[];
  ragZipPath?: string;
}

// Ralph iterative mode types
export interface RalphStatusBlock {
  status: 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED';
  tasksCompletedThisLoop: number;
  filesModified: number;
  testsStatus: 'PASSING' | 'FAILING' | 'NOT_RUN';
  workType: 'IMPLEMENTATION' | 'TESTING' | 'DOCUMENTATION' | 'REFACTORING';
  exitSignal: boolean;
  recommendation: string;
}

export interface RalphProgressData {
  iteration: number;
  maxIterations: number;
  tasksCompleted: number;
  testsGenerated: number;
  workType: string;
}
