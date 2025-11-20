/**
 * Cliente para Vapi Evals API
 * Documentación: https://docs.vapi.ai
 *
 * NOTA IMPORTANTE:
 * - Test Suites solo existen en la UI de Vapi, NO en la API REST
 * - Esta implementación usa Evals API que sí está disponible
 * - Los Evals permiten crear "mock conversations" para evaluar assistants
 */

import { VapiClient as VapiSDK } from '@vapi-ai/server-sdk';
import type {
  VapiConfig,
  VapiPollOptions,
  Eval,
  CreateEvalDto,
  UpdateEvalDto,
  EvalRun,
  CreateEvalRunDto,
  EvalPaginatedResponse,
  EvalRunPaginatedResponse,
} from '../types/vapi.types.js';

// Types for Chat API
export interface CreateChatRequest {
  assistantId: string;
  input: string | ChatMessage[];
  sessionId?: string;
  previousChatId?: string;
  name?: string;
  stream?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'developer';
  content: string;
}

export interface ChatResponse {
  id: string;
  assistantId?: string;
  sessionId?: string;
  previousChatId?: string;
  input: string | ChatMessage[];
  output: ChatMessage[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  cost?: number;
  costs?: any[];
}

export class VapiClient {
  private sdk: VapiSDK;
  private apiKey: string;
  private assistantId?: string;

  constructor(config: VapiConfig) {
    this.apiKey = config.apiKey;
    this.assistantId = config.assistantId;

    // Inicializar SDK de Vapi
    this.sdk = new VapiSDK({
      token: this.apiKey,
      ...(config.baseURL && { environment: config.baseURL })
    });
  }

  // ==========================================================================
  // EVAL MANAGEMENT
  // ==========================================================================

  /**
   * Lista todos los evals con paginación
   */
  async listEvals(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Eval[]> {
    try {
      const response = await this.sdk.eval.evalControllerGetPaginated({
        limit: options?.limit,
      });

      // El SDK retorna EvalPaginatedResponse pero tipado como HttpResponsePromise
      // Necesitamos extraer los items
      const items = (response as any).items || [];
      return items as Eval[];
    } catch (error) {
      throw this.handleError(error, 'Failed to list evals');
    }
  }

  /**
   * Obtiene un eval por ID
   */
  async getEval(evalId: string): Promise<Eval> {
    try {
      const eval_ = await this.sdk.eval.evalControllerGet({ id: evalId });
      return eval_ as Eval;
    } catch (error) {
      throw this.handleError(error, `Failed to get eval ${evalId}`);
    }
  }

  /**
   * Crea un nuevo eval (persistente)
   * NOTA: Solo usar si persistent=true. Para evals transientes, usar runEval directamente.
   */
  async createEval(config: CreateEvalDto): Promise<Eval> {
    try {
      const eval_ = await this.sdk.eval.evalControllerCreate(config);
      return eval_ as Eval;
    } catch (error) {
      throw this.handleError(error, 'Failed to create eval');
    }
  }

  /**
   * Actualiza un eval existente
   */
  async updateEval(evalId: string, updates: Partial<CreateEvalDto>): Promise<Eval> {
    try {
      const eval_ = await this.sdk.eval.evalControllerUpdate({
        id: evalId,
        ...updates,
      } as UpdateEvalDto);
      return eval_ as Eval;
    } catch (error) {
      throw this.handleError(error, `Failed to update eval ${evalId}`);
    }
  }

  /**
   * Elimina un eval
   */
  async deleteEval(evalId: string): Promise<void> {
    try {
      await this.sdk.eval.evalControllerRemove({ id: evalId });
    } catch (error) {
      throw this.handleError(error, `Failed to delete eval ${evalId}`);
    }
  }

  // ==========================================================================
  // EVAL EXECUTION
  // ==========================================================================

  /**
   * Ejecuta un eval (transiente o persistente)
   *
   * @param request Configuración de ejecución
   * @param request.evalId ID de un eval existente (para evals persistentes)
   * @param request.eval Definición de eval (para evals transientes - recomendado)
   * @param request.assistantId ID del assistant a evaluar
   * @param request.assistantOverrides Sobrescribir configuración del assistant temporalmente
   * @returns ID del run
   *
   * RECOMENDACIÓN: Usar eval transiente (pasar `eval` en lugar de `evalId`)
   * para evitar acumular evals en tu cuenta de Vapi.
   */
  async runEval(request: {
    evalId?: string;
    eval?: CreateEvalDto;
    assistantId?: string;
    assistantOverrides?: any;
  }): Promise<string> {
    try {
      const assistantId = this.getAssistantId(request.assistantId);

      const runRequest: CreateEvalRunDto = {
        type: 'eval',
        ...(request.evalId && { evalId: request.evalId }),
        ...(request.eval && { eval: request.eval }),
        target: {
          type: 'assistant',
          assistantId,
          ...(request.assistantOverrides && { assistantOverrides: request.assistantOverrides }),
        },
      };

      const response = await this.sdk.eval.evalControllerRun(runRequest);

      // La respuesta contiene evalRunId y workflowId
      const runId = (response as any).evalRunId || (response as any).id;

      if (typeof runId !== 'string') {
        console.error('[VapiClient] Unexpected response format:', JSON.stringify(response, null, 2));
        throw new Error('Unexpected response format from evalControllerRun');
      }

      console.log('[VapiClient] Eval run started:', runId);
      return runId;
    } catch (error) {
      throw this.handleError(error, 'Failed to run eval');
    }
  }

  /**
   * Obtiene el resultado de un eval run
   */
  async getEvalRun(runId: string): Promise<EvalRun> {
    try {
      const run = await this.sdk.eval.evalControllerGetRun({ id: runId });
      return run as EvalRun;
    } catch (error) {
      throw this.handleError(error, `Failed to get eval run ${runId}`);
    }
  }

  /**
   * Hace polling de un eval run hasta que complete
   *
   * @param runId ID del run
   * @param options Opciones de polling
   * @returns EvalRun completado
   *
   * Estados del run:
   * - "queued": En cola
   * - "running": Ejecutándose
   * - "ended": Terminado (puede ser exitoso o fallido)
   */
  async pollEvalRun(runId: string, options: VapiPollOptions = {}): Promise<EvalRun> {
    const interval = options.interval || 2000;  // 2 segundos
    const timeout = options.timeout || 300000;  // 5 minutos
    const startTime = Date.now();

    const TERMINAL_STATE = 'ended';
    const RUNNING_STATES = new Set(['queued', 'running']);

    console.log(`[Vapi] Starting poll for run ${runId}`);

    while (true) {
      const run = await this.getEvalRun(runId);

      console.log(`[Vapi] Run ${runId} status: ${run.status}`, {
        endedAt: run.endedAt,
        results: run.results?.length || 0,
      });

      // Notificar progreso
      if (options.onProgress) {
        options.onProgress(run.status);
      }

      // Si terminó, retornar
      if (run.status === TERMINAL_STATE) {
        console.log(`[Vapi] Run ${runId} ended`);
        return run;
      }

      // Validar que esté en estado conocido
      if (!RUNNING_STATES.has(run.status)) {
        console.warn(`[Vapi] Unexpected eval run status: ${run.status}, continuing...`);
      }

      // Verificar timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        throw new Error(
          `Eval run polling timeout after ${timeout}ms. Last status: ${run.status}`
        );
      }

      // Esperar antes del siguiente poll
      await this.sleep(interval);
    }
  }

  /**
   * Lista todos los runs con paginación
   */
  async listEvalRuns(options?: {
    limit?: number;
    evalId?: string;
  }): Promise<EvalRun[]> {
    try {
      const response = await this.sdk.eval.evalControllerGetRunsPaginated({
        limit: options?.limit,
      });

      const items = (response as any).items || [];
      return items as EvalRun[];
    } catch (error) {
      throw this.handleError(error, 'Failed to list eval runs');
    }
  }

  /**
   * Elimina un eval run
   */
  async deleteEvalRun(runId: string): Promise<void> {
    try {
      await this.sdk.eval.evalControllerRemoveRun({ id: runId });
    } catch (error) {
      throw this.handleError(error, `Failed to delete eval run ${runId}`);
    }
  }

  // ==========================================================================
  // ASSISTANT MANAGEMENT
  // ==========================================================================

  /**
   * Obtiene la configuración completa de un assistant
   */
  async getAssistant(assistantId: string): Promise<any> {
    try {
      const assistant = await this.sdk.assistants.get({ id: assistantId });
      return assistant;
    } catch (error) {
      throw this.handleError(error, `Failed to get assistant ${assistantId}`);
    }
  }

  /**
   * Lista todos los assistants
   */
  async listAssistants(options?: { limit?: number }): Promise<any[]> {
    try {
      const assistants = await this.sdk.assistants.list({
        limit: options?.limit,
      });
      return assistants as any[];
    } catch (error) {
      throw this.handleError(error, 'Failed to list assistants');
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Obtiene o usa el assistant ID por defecto
   */
  getAssistantId(override?: string): string {
    const assistantId = override || this.assistantId;
    if (!assistantId) {
      throw new Error('Assistant ID not provided and no default configured');
    }
    return assistantId;
  }

  /**
   * Utility: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Maneja errores de la API de Vapi
   */
  private handleError(error: any, context: string): Error {
    // Preparar detalles del error para debugging
    const errorDetails: any = {
      context,
      timestamp: new Date().toISOString(),
    };

    if (error.response) {
      // Error de respuesta HTTP
      const status = error.response.status;
      const data = error.response.data;

      errorDetails.statusCode = status;
      errorDetails.responseData = data;
      errorDetails.url = error.response.config?.url;
      errorDetails.method = error.response.config?.method?.toUpperCase();

      const message = data?.message || data?.error || 'Unknown API error';
      const fullMessage = `${context}: ${message} (HTTP ${status})`;

      const err = new Error(fullMessage);
      (err as any).details = errorDetails;
      return err;
    }

    if (error.request) {
      // Error de red (no se recibió respuesta)
      errorDetails.request = {
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        timeout: error.config?.timeout,
      };

      const err = new Error(`${context}: Network error - no response received`);
      (err as any).details = errorDetails;
      return err;
    }

    // Otro tipo de error
    const err = new Error(`${context}: ${error.message || 'Unknown error'}`);
    (err as any).details = errorDetails;
    (err as any).originalError = error;
    return err;
  }

  // ==========================================================================
  // CHAT API - Para testing multi-turno
  // ==========================================================================

  /**
   * Crea un chat con el assistant
   * Para multi-turno, usa previousChatId o sessionId para mantener contexto
   */
  async createChat(request: CreateChatRequest): Promise<ChatResponse> {
    try {
      console.log(`[VapiClient] Creating chat with input:`,
        typeof request.input === 'string'
          ? request.input.substring(0, 100)
          : `${request.input.length} messages`
      );

      const response = await this.sdk.chats.create(request as any);

      console.log(`[VapiClient] Chat created:`, response.id);

      return response as ChatResponse;
    } catch (error) {
      throw this.handleError(error, 'Failed to create chat');
    }
  }

  /**
   * Ejecuta una conversación multi-turno completa
   * Envía cada mensaje del usuario y espera la respuesta del assistant
   */
  async runMultiTurnConversation(
    assistantId: string,
    userMessages: string[],
    options: { name?: string; sessionId?: string } = {}
  ): Promise<{
    chats: ChatResponse[];
    fullConversation: ChatMessage[];
    totalCost: number;
  }> {
    const chats: ChatResponse[] = [];
    const fullConversation: ChatMessage[] = [];
    let previousChatId: string | undefined;
    let totalCost = 0;

    console.log(`[VapiClient] Starting multi-turn conversation with ${userMessages.length} user messages`);

    for (let i = 0; i < userMessages.length; i++) {
      const userMessage = userMessages[i];

      console.log(`[VapiClient] Turn ${i + 1}/${userMessages.length}: "${userMessage.substring(0, 50)}..."`);

      // Limitar nombre a 40 caracteres (requerimiento de Vapi API)
      let chatName: string | undefined;
      if (options.name) {
        const turnSuffix = ` - T${i + 1}`;
        const maxBaseLength = 40 - turnSuffix.length;
        const baseName = options.name.length > maxBaseLength
          ? options.name.substring(0, maxBaseLength - 3) + '...'
          : options.name;
        chatName = baseName + turnSuffix;
      }

      const chat = await this.createChat({
        assistantId,
        input: userMessage,
        previousChatId,
        sessionId: options.sessionId,
        name: chatName,
      });

      chats.push(chat);
      previousChatId = chat.id;

      // Agregar mensaje de usuario
      fullConversation.push({
        role: 'user',
        content: userMessage,
      });

      // Agregar respuesta(s) del assistant
      if (chat.output && Array.isArray(chat.output)) {
        fullConversation.push(...chat.output);
        console.log(`[VapiClient] Assistant responded with ${chat.output.length} message(s)`);
      }

      if (chat.cost) {
        totalCost += chat.cost;
      }
    }

    console.log(`[VapiClient] Multi-turn conversation completed: ${chats.length} turns, total cost: $${totalCost.toFixed(4)}`);

    return {
      chats,
      fullConversation,
      totalCost,
    };
  }
}
