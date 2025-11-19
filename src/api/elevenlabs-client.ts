import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type {
  ElevenLabsConfig,
  SimulationSpecification,
  SimulationResponse,
  TestsList,
} from '../types/index.js';
import { ElevenLabsAPIError } from './errors.js';

/**
 * Cliente para interactuar con la API de ElevenLabs
 */
export class ElevenLabsClient {
  private axiosInstance: AxiosInstance;
  private apiKey: string;

  constructor(config: ElevenLabsConfig) {
    this.apiKey = config.apiKey;
    this.axiosInstance = axios.create({
      baseURL: config.baseURL || 'https://api.elevenlabs.io',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      // Timeout de 2 minutos para conversaciones largas
      timeout: 120000,
      // Validar status codes
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Configurar retry automático para errores 5xx y errores de red
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Reintentar en errores de red
        if (axiosRetry.isNetworkError(error)) {
          return true;
        }

        // Reintentar en errores 5xx (servidor)
        if (axiosRetry.isRetryableError(error)) {
          return true;
        }

        // Reintentar en timeouts
        if (error.code === 'ECONNABORTED') {
          return true;
        }

        return false;
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.warn(
          `Reintentando request (${retryCount}/3): ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`
        );
      },
    });
  }

  /**
   * Simula una conversación con el agente
   * @param agentId - ID del agente
   * @param specification - Especificación de la simulación
   * @returns Respuesta de la simulación con conversación y análisis
   */
  async simulateConversation(
    agentId: string,
    specification: SimulationSpecification
  ): Promise<SimulationResponse> {
    try {
      const response = await this.axiosInstance.post<SimulationResponse>(
        `/v1/convai/agents/${agentId}/simulate-conversation`,
        specification
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error simulando conversación: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Crea un test persistente en ElevenLabs
   * @param testData - Datos del test a crear
   * @returns ID del test creado
   */
  async createPersistentTest(
    testData: import('../types/index.js').CreatePersistentTestRequest
  ): Promise<import('../types/index.js').CreateTestResponse> {
    try {
      const response = await this.axiosInstance.post<import('../types/index.js').CreateTestResponse>(
        '/v1/convai/agent-testing/create',
        testData
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error creando test persistente: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Ejecuta tests persistentes en un agente
   * @param agentId - ID del agente
   * @param testIds - IDs de los tests a ejecutar
   * @returns Resultado de la ejecución
   */
  async runPersistentTests(
    agentId: string,
    testIds: string[]
  ): Promise<import('../types/index.js').TestSuiteInvocation> {
    try {
      const request: import('../types/index.js').RunTestsRequest = {
        tests: testIds.map((id) => ({ test_id: id })),
      };

      const response = await this.axiosInstance.post<import('../types/index.js').TestSuiteInvocation>(
        `/v1/convai/agents/${agentId}/run-tests`,
        request
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error ejecutando tests: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Lista todos los tests
   * @param search - Filtro opcional por nombre
   * @param pageSize - Tamaño de página (max 100, default 30)
   * @returns Lista de tests
   */
  async listPersistentTests(search?: string, pageSize?: number): Promise<TestsList> {
    try {
      const params: any = {};
      if (search) params.search = search;
      if (pageSize) params.page_size = pageSize;

      const response = await this.axiosInstance.get<TestsList>(
        '/v1/convai/agent-testing',
        { params }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error listando tests: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Obtiene un test específico
   * @param agentId - ID del agente
   * @param testId - ID del test
   * @returns Datos del test
   */
  async getPersistentTest(
    agentId: string,
    testId: string
  ): Promise<import('../types/index.js').PersistentTest> {
    try {
      const response = await this.axiosInstance.get<import('../types/index.js').PersistentTest>(
        `/v1/convai/agents/${agentId}/tests/${testId}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error obteniendo test: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Obtiene información de un agente
   * @param agentId - ID del agente
   * @returns Datos del agente
   */
  async getAgent(agentId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/v1/convai/agents/${agentId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error obteniendo agente: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Actualiza la configuración de un agente
   * @param agentId - ID del agente a actualizar
   * @param agentConfig - Nueva configuración del agente
   * @returns Datos del agente actualizado
   */
  async updateAgent(agentId: string, agentConfig: any): Promise<any> {
    try {
      const response = await this.axiosInstance.patch(
        `/v1/convai/agents/${agentId}`,
        agentConfig
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ElevenLabsAPIError(
          `Error actualizando agente: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }
}
