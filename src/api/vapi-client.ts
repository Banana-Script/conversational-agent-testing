/**
 * Cliente para Vapi API
 * Documentación: https://docs.vapi.ai
 */

import { VapiClient as VapiSDK } from '@vapi-ai/server-sdk';
import type {
  VapiConfig,
  VapiTestConfig,
  VapiTestSuite,
  VapiTest,
  VapiTestRun,
  VapiPollOptions,
  CreateTestSuiteRequest,
  ListTestSuitesResponse,
  ListTestsResponse,
} from '../types/vapi.types.js';

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

  /**
   * Lista todos los test suites
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async listTestSuites(): Promise<VapiTestSuite[]> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Obtiene un test suite por ID
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async getTestSuite(suiteId: string): Promise<VapiTestSuite> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Crea un nuevo test suite
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async createTestSuite(request: CreateTestSuiteRequest): Promise<VapiTestSuite> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Busca un test suite por nombre
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async findTestSuiteByName(name: string): Promise<VapiTestSuite | null> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Lista todos los tests de un suite
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async listTests(suiteId: string): Promise<VapiTest[]> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Crea un nuevo test en un suite
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async createTest(suiteId: string, testConfig: VapiTestConfig): Promise<VapiTest> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Actualiza un test existente
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async updateTest(
    suiteId: string,
    testId: string,
    testConfig: Partial<VapiTestConfig>
  ): Promise<VapiTest> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Elimina un test
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async deleteTest(suiteId: string, testId: string): Promise<void> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Ejecuta un test suite
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async runTestSuite(suiteId: string): Promise<VapiTestRun> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Obtiene el estado de una ejecución de test
   * NOTA: Esta funcionalidad requiere API actualizada de Vapi
   */
  async getTestRun(runId: string): Promise<VapiTestRun> {
    throw new Error('Test Suites API not yet implemented in current Vapi SDK version');
  }

  /**
   * Hace polling de una ejecución de test hasta que complete
   */
  async pollTestRun(runId: string, options: VapiPollOptions = {}): Promise<VapiTestRun> {
    const interval = options.interval || 2000;  // 2 segundos
    const timeout = options.timeout || 300000;  // 5 minutos
    const startTime = Date.now();

    const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'timeout']);
    const VALID_STATES = new Set(['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout']);
    const MAX_ITERATIONS = Math.ceil(timeout / interval);
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const run = await this.getTestRun(runId);

      // Notificar progreso si hay callback
      if (options.onProgress) {
        options.onProgress(run.status);
      }

      // Validar estado
      if (!VALID_STATES.has(run.status)) {
        console.warn(`Unexpected test run status: ${run.status}, continuing...`);
      }

      // Si completó (exitoso o fallido), retornar
      if (TERMINAL_STATES.has(run.status)) {
        return run;
      }

      // Verificar timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        throw new Error(`Test run polling timeout after ${timeout}ms. Last status: ${run.status}`);
      }

      // Esperar antes del siguiente poll
      await this.sleep(interval);
    }

    throw new Error(`Polling exceeded maximum iterations (${MAX_ITERATIONS})`);
  }

  /**
   * Ejecuta un test suite y espera los resultados
   */
  async runAndWaitForResults(
    suiteId: string,
    pollOptions?: VapiPollOptions
  ): Promise<VapiTestRun> {
    // Ejecutar el suite
    const run = await this.runTestSuite(suiteId);

    // Esperar resultados con polling
    const results = await this.pollTestRun(run.id, pollOptions);

    return results;
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
    // Prepare error details for debugging
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
}
