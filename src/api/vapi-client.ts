/**
 * Cliente para Vapi API
 * Documentación: https://docs.vapi.ai
 */

import { Vapi } from '@vapi-ai/server-sdk';
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
  private sdk: Vapi;
  private apiKey: string;
  private assistantId?: string;

  constructor(config: VapiConfig) {
    this.apiKey = config.apiKey;
    this.assistantId = config.assistantId;

    // Inicializar SDK de Vapi
    this.sdk = new Vapi({
      token: this.apiKey,
      ...(config.baseURL && { environment: config.baseURL })
    });
  }

  /**
   * Lista todos los test suites
   */
  async listTestSuites(): Promise<VapiTestSuite[]> {
    try {
      // El SDK de Vapi maneja la paginación automáticamente
      const response = await this.sdk.testSuites.list();
      return response as VapiTestSuite[];
    } catch (error) {
      throw this.handleError(error, 'Failed to list test suites');
    }
  }

  /**
   * Obtiene un test suite por ID
   */
  async getTestSuite(suiteId: string): Promise<VapiTestSuite> {
    try {
      const suite = await this.sdk.testSuites.get(suiteId);
      return suite as VapiTestSuite;
    } catch (error) {
      throw this.handleError(error, `Failed to get test suite ${suiteId}`);
    }
  }

  /**
   * Crea un nuevo test suite
   */
  async createTestSuite(request: CreateTestSuiteRequest): Promise<VapiTestSuite> {
    try {
      const suite = await this.sdk.testSuites.create({
        name: request.name,
        description: request.description,
      });
      return suite as VapiTestSuite;
    } catch (error) {
      throw this.handleError(error, 'Failed to create test suite');
    }
  }

  /**
   * Busca un test suite por nombre
   */
  async findTestSuiteByName(name: string): Promise<VapiTestSuite | null> {
    try {
      const suites = await this.listTestSuites();
      return suites.find(s => s.name === name) || null;
    } catch (error) {
      throw this.handleError(error, `Failed to find test suite by name: ${name}`);
    }
  }

  /**
   * Lista todos los tests de un suite
   */
  async listTests(suiteId: string): Promise<VapiTest[]> {
    try {
      const response = await this.sdk.testSuites.listTests(suiteId);
      return response as VapiTest[];
    } catch (error) {
      throw this.handleError(error, `Failed to list tests for suite ${suiteId}`);
    }
  }

  /**
   * Crea un nuevo test en un suite
   */
  async createTest(suiteId: string, testConfig: VapiTestConfig): Promise<VapiTest> {
    try {
      const test = await this.sdk.testSuites.createTest(suiteId, {
        type: testConfig.type,
        assistant: testConfig.assistant,
        script: testConfig.script,
        evaluationPlan: {
          rubric: testConfig.evaluationPlan.rubric,
        },
        attempts: testConfig.attempts || 1,
        name: testConfig.name,
        description: testConfig.description,
        variableValues: testConfig.variableValues,
      });
      return test as VapiTest;
    } catch (error) {
      throw this.handleError(error, `Failed to create test in suite ${suiteId}`);
    }
  }

  /**
   * Actualiza un test existente
   */
  async updateTest(
    suiteId: string,
    testId: string,
    testConfig: Partial<VapiTestConfig>
  ): Promise<VapiTest> {
    try {
      const test = await this.sdk.testSuites.updateTest(suiteId, testId, {
        type: testConfig.type,
        assistant: testConfig.assistant,
        script: testConfig.script,
        evaluationPlan: testConfig.evaluationPlan ? {
          rubric: testConfig.evaluationPlan.rubric,
        } : undefined,
        attempts: testConfig.attempts,
        name: testConfig.name,
        description: testConfig.description,
        variableValues: testConfig.variableValues,
      });
      return test as VapiTest;
    } catch (error) {
      throw this.handleError(error, `Failed to update test ${testId}`);
    }
  }

  /**
   * Elimina un test
   */
  async deleteTest(suiteId: string, testId: string): Promise<void> {
    try {
      await this.sdk.testSuites.deleteTest(suiteId, testId);
    } catch (error) {
      throw this.handleError(error, `Failed to delete test ${testId}`);
    }
  }

  /**
   * Ejecuta un test suite
   */
  async runTestSuite(suiteId: string): Promise<VapiTestRun> {
    try {
      const run = await this.sdk.testSuites.run(suiteId);
      return run as VapiTestRun;
    } catch (error) {
      throw this.handleError(error, `Failed to run test suite ${suiteId}`);
    }
  }

  /**
   * Obtiene el estado de una ejecución de test
   */
  async getTestRun(runId: string): Promise<VapiTestRun> {
    try {
      const run = await this.sdk.testSuiteRuns.get(runId);
      return run as VapiTestRun;
    } catch (error) {
      throw this.handleError(error, `Failed to get test run ${runId}`);
    }
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
}
