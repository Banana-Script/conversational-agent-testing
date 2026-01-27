/**
 * Viernes API Type Definitions
 */

// Configuration
export interface ViernesConfig {
  apiKey?: string;
  baseURL?: string;
  organizationId?: string;
}

// Simulated User Config (API format)
export interface ViernesSimulatedUserConfig {
  persona: string;
  model: string; // Flexible: gpt-4o-mini, gpt-4o, gpt-oss:20b, ollama/*, etc.
  temperature: number;
  initial_message: string;
  max_tokens: number;
  provider?: 'openai' | 'ollama' | null;
}

// Evaluation Criterion (API format)
export interface ViernesEvaluationCriterion {
  id: string;
  goal: string;
  evaluation_prompt: string;
}

// Expected Structured Data Field (Request)
export interface ViernesExpectedStructuredDataField {
  field_name: string;
  expected_value: string | string[];
  match_mode?: 'exact' | 'contains' | 'regex' | 'any_of';
  capture_strategy?: 'first' | 'last' | 'all';
  required?: boolean;
  description?: string;
}

// Request
export interface ViernesSimulationRequest {
  organization_id: number;
  agent_id: number;
  platform: 'whatsapp' | 'telegram' | 'facebook' | 'instagram' | 'web' | 'api';
  simulated_user_config: ViernesSimulatedUserConfig;
  max_turns?: number;
  conversation_timeout?: number;
  webhook_timeout?: number;
  evaluation_criteria?: ViernesEvaluationCriterion[];
  expected_structured_data?: ViernesExpectedStructuredDataField[];
}

// Transcript Turn
export interface ViernesTranscriptTurn {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
  tokens_used?: {
    prompt_tokens: number;
    response_tokens: number;
  };
  timestamp: string;
  tool_calls?: any[];
  tool_results?: any[];
  interrupted?: boolean;
  message_id?: string;
  response_type?: string | null; // 'normal', 'tool_call', etc. or null for user messages
}

// Evaluation Result
export interface ViernesEvaluationResult {
  criterion_id: string;
  success: boolean;
  rationale: string;
  score: number;
}

// Quality Metrics
export interface ViernesQualityMetrics {
  avg_response_time_secs: number;
  total_tokens_used?: number;
  total_turns: number;
  user_turns: number;
  agent_turns: number;
  conversation_duration_secs: number;
  tool_calls_count: number;
}

// Structured Data Field Result (Response)
export interface ViernesFieldResult {
  field_name: string;
  expected_value: string | string[];
  captured_value: string | null;
  captured_from_turn: number | null;
  match_mode: string;
  success: boolean;
  reason: string;
}

// Structured Data Evaluation (Response)
export interface ViernesStructuredDataEvaluation {
  total_fields: number;
  passed_fields: number;
  failed_fields: number;
  missing_fields: number;
  success_rate: number;
  all_passed: boolean;
  field_results: ViernesFieldResult[];
  captured_data_summary: Record<string, Array<{ value: string; turn: number }>>;
}

// Analysis
export interface ViernesAnalysis {
  call_successful: 'success' | 'failed';
  transcript_summary?: string;
  quality_metrics: ViernesQualityMetrics;
  evaluation_criteria_results: ViernesEvaluationResult[];
  agent_performance_score: number;
  structured_data_evaluation?: ViernesStructuredDataEvaluation;
}

// Simulation Status Type
export type ViernesSimulationStatus =
  | 'pending'    // En cola, no iniciado
  | 'running'    // En progreso
  | 'completed'  // Finalizado exitosamente
  | 'failed'     // Error durante ejecución
  | 'error'      // Error de sistema
  | 'timeout';   // Excedió límite de tiempo

// Progress Tracking
export interface ViernesSimulationProgress {
  current_turn: number;
  total_turns: number;
  elapsed_seconds: number;
}

// Start Response (202 Accepted)
export interface ViernesSimulationStartResponse {
  simulation_id: string;
  status: 'pending';
  message: string;
}

// Status Polling Response
export interface ViernesSimulationStatusResponse {
  simulation_id: string;
  status: ViernesSimulationStatus;
  progress: ViernesSimulationProgress | null;
  results: ViernesSimulationResponse | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Concurrency Error (429)
export interface ViernesConcurrencyError {
  error: 'concurrency_limit_exceeded';
  message: string;
  limits: {
    global: string;
    per_organization: string;
  };
}

// Response
export interface ViernesSimulationResponse {
  simulation_id: string;
  organization_id: number;
  agent_id: number;
  platform: string;
  status: ViernesSimulationStatus;
  duration_secs: number;
  transcript: ViernesTranscriptTurn[];
  analysis: ViernesAnalysis;
  metadata?: Record<string, any>;
  error?: string;
}

// Health Check Response
export interface ViernesHealthResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  version: string;
}
