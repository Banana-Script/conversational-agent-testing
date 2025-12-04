import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import type {
  ViernesConfig,
  ViernesSimulationRequest,
  ViernesSimulationResponse,
  ViernesSimulationStartResponse,
  ViernesSimulationStatusResponse,
  ViernesHealthResponse,
} from '../types/viernes.types.js';
import { ViernesAPIError } from './errors.js';
import { ViernesQueue } from './viernes-queue.js';

/**
 * Cliente para interactuar con la API de Viernes
 */
export class ViernesClient {
  private axiosInstance: AxiosInstance;
  private apiKey?: string;
  private queue: ViernesQueue;

  constructor(config: ViernesConfig) {
    this.apiKey = config.apiKey;

    this.axiosInstance = axios.create({
      baseURL: config.baseURL || 'https://bot.dev.viernes-for-business.bananascript.io',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
      timeout: 30000, // 30 seconds (async endpoints return quickly)
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Configure retry logic
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        // Don't retry 429 (handled by queue)
        if (error.response?.status === 429) return false;

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

    // Add verbose logging interceptors
    this.setupVerboseLogging();

    // Initialize queue
    this.queue = new ViernesQueue(
      (request, onProgress) => this.simulateConversation(request, onProgress)
    );
  }

  /**
   * Setup verbose logging interceptors for HTTP requests/responses
   */
  private setupVerboseLogging(): void {
    const isVerbose = process.env.VERBOSE_HTTP === 'true';

    if (!isVerbose) {
      return;
    }

    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log('\n' + '='.repeat(80));
        console.log('📤 HTTP REQUEST');
        console.log('='.repeat(80));
        console.log(`Method: ${config.method?.toUpperCase()}`);
        console.log(`URL: ${config.baseURL}${config.url}`);
        console.log(`Headers:`, JSON.stringify(config.headers, null, 2));

        if (config.data) {
          console.log(`Body:`, JSON.stringify(config.data, null, 2));
        }

        console.log('='.repeat(80) + '\n');
        return config;
      },
      (error) => {
        console.error('❌ REQUEST ERROR:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log('\n' + '='.repeat(80));
        console.log('📥 HTTP RESPONSE');
        console.log('='.repeat(80));
        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log(`URL: ${response.config.baseURL}${response.config.url}`);
        console.log(`Headers:`, JSON.stringify(response.headers, null, 2));

        if (response.data) {
          // Truncate large responses
          const dataStr = JSON.stringify(response.data, null, 2);
          if (dataStr.length > 5000) {
            console.log(`Body (truncated):`, dataStr.substring(0, 5000) + '\n... (truncated)');
          } else {
            console.log(`Body:`, dataStr);
          }
        }

        console.log('='.repeat(80) + '\n');
        return response;
      },
      (error) => {
        console.log('\n' + '='.repeat(80));
        console.log('❌ HTTP ERROR RESPONSE');
        console.log('='.repeat(80));

        if (error.response) {
          console.log(`Status: ${error.response.status} ${error.response.statusText}`);
          console.log(`URL: ${error.config?.baseURL}${error.config?.url}`);
          console.log(`Headers:`, JSON.stringify(error.response.headers, null, 2));

          if (error.response.data) {
            console.log(`Error Body:`, JSON.stringify(error.response.data, null, 2));
          }
        } else if (error.request) {
          console.log('No response received');
          console.log(`Request:`, error.request);
        } else {
          console.log(`Error:`, error.message);
        }

        console.log('='.repeat(80) + '\n');
        return Promise.reject(error);
      }
    );
  }

  /**
   * Start a conversation simulation (async - returns 202 Accepted)
   */
  async startSimulation(
    request: ViernesSimulationRequest
  ): Promise<ViernesSimulationStartResponse> {
    try {
      const response = await this.axiosInstance.post<ViernesSimulationStartResponse>(
        '/simulate/conversation',
        request
      );

      if (response.status !== 202) {
        throw new ViernesAPIError(
          `Unexpected response status: ${response.status}. Expected 202 Accepted`,
          response.status,
          response.data
        );
      }

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
   * Get simulation status and results (polling endpoint)
   */
  async getSimulationStatus(simulationId: string): Promise<ViernesSimulationStatusResponse> {
    try {
      const response = await this.axiosInstance.get<ViernesSimulationStatusResponse>(
        `/simulate/status/${simulationId}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // 404 = simulation expired (TTL 1hr)
        if (error.response?.status === 404) {
          throw new ViernesAPIError(
            'Simulation not found or expired (results expire after 1 hour)',
            404,
            { simulation_id: simulationId }
          );
        }
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
   * Start simulation and poll for results (async)
   */
  async simulateConversation(
    request: ViernesSimulationRequest,
    onProgress?: (status: string) => void
  ): Promise<ViernesSimulationResponse> {
    onProgress?.('Starting simulation...');

    const startResponse = await this.startSimulation(request);
    const result = await this.pollSimulation(startResponse.simulation_id, onProgress);

    onProgress?.('Simulation completed successfully!');
    return result;
  }

  /**
   * Poll for simulation results with exponential backoff
   */
  private async pollSimulation(
    simulationId: string,
    onProgress?: (status: string) => void
  ): Promise<ViernesSimulationResponse> {
    const maxAttempts = 300;
    const initialIntervalMs = 2000;
    const maxIntervalMs = 5000;
    const timeoutMs = 600000; // 10 minutes

    const startTime = Date.now();
    let currentInterval = initialIntervalMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check total timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        throw new ViernesAPIError(
          `Polling timeout after ${timeoutMs / 1000}s`,
          408,
          { simulation_id: simulationId, attempts: attempt }
        );
      }

      // Wait (except first attempt)
      if (attempt > 1) {
        await this.sleep(currentInterval);
        currentInterval = Math.min(currentInterval * 1.5, maxIntervalMs);
      }

      // Poll status
      const statusResponse = await this.getSimulationStatus(simulationId);

      // Handle terminal states
      switch (statusResponse.status) {
        case 'completed':
          if (!statusResponse.results) {
            throw new ViernesAPIError(
              'Simulation completed but results missing',
              500,
              { simulation_id: simulationId }
            );
          }
          return statusResponse.results;

        case 'failed':
        case 'error':
          const errorMsg = statusResponse.error || 'Unknown error';
          throw new ViernesAPIError(
            `Simulation failed: ${errorMsg}`,
            500,
            { simulation_id: simulationId, error: statusResponse.error }
          );

        case 'timeout':
          throw new ViernesAPIError(
            'Simulation exceeded server timeout',
            504,
            { simulation_id: simulationId }
          );

        case 'pending':
        case 'running':
          // Continue polling
          break;
      }
    }

    throw new ViernesAPIError(
      `Max polling attempts exceeded (${maxAttempts})`,
      408,
      { simulation_id: simulationId }
    );
  }

  /**
   * Simulate conversation with automatic queue handling for 429 errors
   */
  async simulateConversationWithQueue(
    request: ViernesSimulationRequest,
    onProgress?: (status: string) => void
  ): Promise<ViernesSimulationResponse> {
    try {
      return await this.simulateConversation(request, onProgress);
    } catch (error) {
      // If 429, enqueue for retry
      if (error instanceof ViernesAPIError && error.statusCode === 429) {
        onProgress?.('Queue full. Waiting for available slot...');
        return await this.queue.enqueue(request, onProgress);
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
