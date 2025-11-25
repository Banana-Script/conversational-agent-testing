import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type {
  ViernesConfig,
  ViernesSimulationRequest,
  ViernesSimulationResponse,
  ViernesHealthResponse,
} from '../types/viernes.types.js';
import { ViernesAPIError } from './errors.js';

/**
 * Cliente para interactuar con la API de Viernes
 */
export class ViernesClient {
  private axiosInstance: AxiosInstance;
  private apiKey?: string;

  constructor(config: ViernesConfig) {
    this.apiKey = config.apiKey;

    this.axiosInstance = axios.create({
      baseURL: config.baseURL || 'https://bot.dev.viernes-for-business.bananascript.io',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
      timeout: 180000, // 3 minutes default (Viernes handles longer conversations internally)
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Configure retry logic
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkError(error) ||
               axiosRetry.isRetryableError(error) ||
               error.code === 'ECONNABORTED';
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.warn(
          `[ViernesClient] Retrying request (${retryCount}/3): ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`
        );
      },
    });
  }

  /**
   * Start a conversation simulation
   */
  async startSimulation(
    request: ViernesSimulationRequest
  ): Promise<ViernesSimulationResponse> {
    try {
      const response = await this.axiosInstance.post<ViernesSimulationResponse>(
        '/simulate/conversation',
        request
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ViernesAPIError(
          `Error starting simulation: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Get simulation status and results
   */
  async getSimulationStatus(simulationId: string): Promise<ViernesSimulationResponse> {
    try {
      const response = await this.axiosInstance.get<ViernesSimulationResponse>(
        `/simulate/status/${simulationId}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ViernesAPIError(
          `Error getting simulation status: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<ViernesHealthResponse> {
    try {
      const response = await this.axiosInstance.get<ViernesHealthResponse>(
        '/simulate/health'
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ViernesAPIError(
          `Health check failed: ${error.message}`,
          error.response?.status,
          error.response?.data,
          error
        );
      }
      throw error;
    }
  }

  /**
   * Start simulation and poll for results (if async)
   * Currently Viernes appears synchronous, but this provides future-proofing
   */
  async simulateConversation(
    request: ViernesSimulationRequest,
    onProgress?: (status: string) => void
  ): Promise<ViernesSimulationResponse> {
    onProgress?.('Starting simulation...');
    const response = await this.startSimulation(request);

    // If response indicates pending/async, poll for results
    if (response.status !== 'completed' && response.status !== 'failed') {
      onProgress?.('Polling for results...');
      return await this.pollSimulation(response.simulation_id, onProgress);
    }

    return response;
  }

  /**
   * Poll for simulation results
   */
  private async pollSimulation(
    simulationId: string,
    onProgress?: (status: string) => void,
    maxAttempts: number = 40,
    intervalMs: number = 3000
  ): Promise<ViernesSimulationResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.sleep(intervalMs);

      const result = await this.getSimulationStatus(simulationId);

      if (result.status === 'completed' || result.status === 'failed') {
        return result;
      }

      onProgress?.(`Waiting for simulation... (${attempt + 1}/${maxAttempts})`);
    }

    throw new ViernesAPIError(
      `Simulation polling timeout after ${maxAttempts * intervalMs / 1000}s`,
      408,
      { simulation_id: simulationId }
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
