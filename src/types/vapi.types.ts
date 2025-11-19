/**
 * Tipos para integración con Vapi
 * Basado en documentación de Vapi API: https://docs.vapi.ai
 */

// Configuración del cliente Vapi
export interface VapiConfig {
  apiKey: string;
  baseURL?: string;
  assistantId?: string;
  defaultSuite?: string;
}

// Configuración de test para Vapi
export interface VapiTestConfig {
  type: 'chat' | 'voice';
  assistant: string;  // Assistant ID
  script: string;     // Free-form script for simulated user (max 10,000 chars)
  evaluationPlan: {
    rubric: string[];  // Array of evaluation questions
  };
  attempts?: number;  // 1-5, number of times to run the test
  name?: string;
  description?: string;
  variableValues?: Record<string, any>;  // Dynamic variables
}

// Test Suite
export interface VapiTestSuite {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

// Test dentro de un suite
export interface VapiTest {
  id: string;
  testSuiteId: string;
  name: string;
  description?: string;
  type: 'chat' | 'voice';
  assistant: string;
  script: string;
  evaluationPlan: {
    rubric: string[];
  };
  attempts: number;
  variableValues?: Record<string, any>;
  createdAt: string;
}

// Resultado de evaluación de un criterio de rubric
export interface VapiRubricResult {
  question: string;
  passed: boolean;
  reasoning: string;
}

// Resultado de un intento individual de test
export interface VapiTestAttempt {
  attemptNumber: number;
  status: 'passed' | 'failed';
  transcript: string;  // Full conversation transcript
  evaluationResults: {
    rubric: VapiRubricResult[];
  };
  duration?: number;  // Duration in milliseconds
  startedAt?: string;
  completedAt?: string;
}

// Resultado de un test (con múltiples intentos)
export interface VapiTestResult {
  testId: string;
  testName: string;
  attempts: VapiTestAttempt[];
  overallStatus: 'passed' | 'failed';
}

// Test Run (ejecución de un test suite)
export interface VapiTestRun {
  id: string;
  testSuiteId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tests: VapiTestResult[];
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

// Suite cache entry (para .vapi-suites.json)
export interface VapiSuiteCacheEntry {
  id: string;
  name: string;
  created_at: string;
  last_used: string;
  tests_count?: number;
  tags?: string[];
}

// Cache file structure
export interface VapiSuiteCache {
  [suiteName: string]: VapiSuiteCacheEntry;
}

// Opciones para polling de test runs
export interface VapiPollOptions {
  interval?: number;   // Polling interval in ms (default: 2000)
  timeout?: number;    // Timeout in ms (default: 300000 = 5 min)
  onProgress?: (status: string) => void;  // Callback for status updates
}

// Request para crear test suite
export interface CreateTestSuiteRequest {
  name: string;
  description?: string;
}

// Request para crear test
export interface CreateTestRequest extends VapiTestConfig {
  // Hereda todos los campos de VapiTestConfig
}

// Request para ejecutar test suite
export interface RunTestSuiteRequest {
  testSuiteId: string;
}

// Response de listado de suites
export interface ListTestSuitesResponse {
  testSuites: VapiTestSuite[];
  pagination?: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

// Response de listado de tests
export interface ListTestsResponse {
  tests: VapiTest[];
  pagination?: {
    hasMore: boolean;
    nextCursor?: string;
  };
}

// Error de Vapi API
export interface VapiError {
  message: string;
  code?: string;
  details?: any;
}
