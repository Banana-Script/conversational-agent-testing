/**
 * Tipos para integración con Vapi Evals API
 * Documentación: https://docs.vapi.ai
 *
 * NOTA: Test Suites solo existen en la UI de Vapi, no en la API.
 * Esta implementación usa Evals API que sí está disponible vía REST.
 */

import type { Vapi } from '@vapi-ai/server-sdk';

// ============================================================================
// RE-EXPORTS DEL SDK DE VAPI
// ============================================================================

// Eval types
export type Eval = Vapi.Eval;
export type CreateEvalDto = Vapi.CreateEvalDto;
export type UpdateEvalDto = Vapi.UpdateEvalDto;
export type EvalType = Vapi.EvalType;

// Eval Run types
export type EvalRun = Vapi.EvalRun;
export type CreateEvalRunDto = Vapi.CreateEvalRunDto;
export type EvalRunResult = Vapi.EvalRunResult;
export type EvalRunResultMessagesItem = Vapi.EvalRunResultMessagesItem;

// Eval Message types
export type CreateEvalDtoMessagesItem = Vapi.CreateEvalDtoMessagesItem;
export type ChatEvalUserMessageMock = Vapi.ChatEvalUserMessageMock;
export type ChatEvalAssistantMessageMock = Vapi.ChatEvalAssistantMessageMock;
export type ChatEvalAssistantMessageEvaluation = Vapi.ChatEvalAssistantMessageEvaluation;
export type ChatEvalSystemMessageMock = Vapi.ChatEvalSystemMessageMock;
export type ChatEvalToolResponseMessageMock = Vapi.ChatEvalToolResponseMessageMock;
export type ChatEvalToolResponseMessageEvaluation = Vapi.ChatEvalToolResponseMessageEvaluation;

// Judge Plan types (para checkpoints de evaluación)
export type ChatEvalAssistantMessageEvaluationJudgePlan = Vapi.ChatEvalAssistantMessageEvaluationJudgePlan;

// Target types
export type CreateEvalRunDtoTarget = Vapi.CreateEvalRunDtoTarget;

// Pagination types
export type EvalPaginatedResponse = Vapi.EvalPaginatedResponse;
export type EvalRunPaginatedResponse = Vapi.EvalRunPaginatedResponse;

// ============================================================================
// CONFIGURACIÓN DE CLIENTE
// ============================================================================

export interface VapiConfig {
  apiKey: string;
  baseURL?: string;
  assistantId?: string;
}

// ============================================================================
// OPCIONES DE EVAL
// ============================================================================

/**
 * Opciones para configurar la ejecución de un Eval
 */
export interface VapiEvalOptions {
  /** Si true, el eval se guarda en Vapi y puede reutilizarse. Si false, es transiente (recomendado). */
  persistent?: boolean;

  /** Máximo de tokens para generar la conversación completa (default: 4000) */
  maxConversationTokens?: number;

  /** Modelo a usar para generar la conversación (default: gpt-4o) */
  generatorModel?: string;

  /** Modelo a usar para los AI judges en checkpoints (default: gpt-4o) */
  judgeModel?: string;

  /** Temperature para generación de conversación (default: 0.3) */
  temperature?: number;
}

// ============================================================================
// CONFIGURACIÓN DE TEST PARA VAPI
// ============================================================================

/**
 * Configuración de test adaptada para Vapi Evals
 * Se convierte desde nuestro YAML a CreateEvalDto
 */
export interface VapiTestConfig {
  /** Nombre del test */
  name: string;

  /** Descripción opcional */
  description?: string;

  /** ID del assistant de Vapi a testear */
  assistantId: string;

  /** Número de intentos (1-5). Se ejecuta manualmente en loop. */
  attempts?: number;

  /**
   * Turnos de conversación manuales (opcional)
   * Si no se provee, se genera automáticamente desde simulatedUserPrompt
   */
  conversationTurns?: ConversationTurn[];

  /**
   * Prompt del usuario simulado para generar conversación automáticamente
   * Solo se usa si conversationTurns no está definido
   */
  simulatedUserPrompt?: string;

  /** Primer mensaje del usuario (requerido si se usa generación automática) */
  firstMessage?: string;

  /** Criterios de evaluación (se convierten en checkpoints) */
  evaluationCriteria: EvaluationCriterion[];

  /** Variables dinámicas para interpolar en mensajes */
  variableValues?: Record<string, any>;

  /** Opciones de eval */
  evalOptions?: VapiEvalOptions;
}

/**
 * Turno de conversación manual
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  message: string;
}

/**
 * Criterio de evaluación
 * Se convierte en un checkpoint con AI judge
 */
export interface EvaluationCriterion {
  id: string;
  name: string;
  prompt: string;  // Pregunta de evaluación
}

// ============================================================================
// RESULTADOS DE EVAL
// ============================================================================

/**
 * Resultado de un criterio de evaluación
 */
export interface VapiCriterionResult {
  criterionId: string;
  criterionName: string;
  passed: boolean;
  reasoning?: string;  // Del AI judge si está disponible
}

/**
 * Resultado de un intento individual de eval
 */
export interface VapiEvalAttempt {
  attemptNumber: number;
  evalRunId: string;
  status: 'pass' | 'fail';

  /** Conversación completa que ocurrió */
  conversation: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;

  /** Resultados de cada criterio de evaluación */
  criteriaResults: VapiCriterionResult[];

  /** Duración en milisegundos */
  duration: number;

  /** Timestamps */
  startedAt: string;
  completedAt: string;

  /** Razón de finalización */
  endedReason?: string;

  /** Costo de la ejecución en USD */
  cost?: number;
}

/**
 * Resultado agregado de un test con múltiples intentos
 */
export interface VapiTestResult {
  testName: string;
  assistantId: string;
  attempts: VapiEvalAttempt[];
  overallStatus: 'passed' | 'failed';
  passRate: number;  // 0.0 - 1.0
  totalDuration: number;
  totalCost?: number;
}

// ============================================================================
// OPCIONES DE POLLING
// ============================================================================

/**
 * Opciones para polling de eval runs
 */
export interface VapiPollOptions {
  /** Intervalo de polling en ms (default: 2000) */
  interval?: number;

  /** Timeout total en ms (default: 300000 = 5 min) */
  timeout?: number;

  /** Callback para actualizaciones de progreso */
  onProgress?: (status: string) => void;
}

// ============================================================================
// ERRORES
// ============================================================================

/**
 * Error de Vapi API
 */
export interface VapiError {
  message: string;
  code?: string;
  details?: any;
  statusCode?: number;
}
