import type {
  ViernesSimulationRequest,
  ViernesSimulationResponse,
} from '../types/viernes.types.js';
import { ViernesAPIError } from './errors.js';

/**
 * Retry configuration from environment variables
 */
const RETRY_CONFIG = {
  // Maximum number of retry attempts (default: 10, max: 50)
  maxAttempts: Math.min(
    parseInt(process.env.VIERNES_MAX_RETRY_ATTEMPTS || '10', 10),
    50
  ),
  // Base delay between retries in ms (default: 30000 = 30s)
  baseDelay: parseInt(process.env.VIERNES_RETRY_DELAY_MS || '30000', 10),
  // Maximum delay between retries in ms (default: 120000 = 2 min)
  maxDelay: parseInt(process.env.VIERNES_MAX_RETRY_DELAY_MS || '120000', 10),
  // Use exponential backoff (default: true)
  useExponentialBackoff: process.env.VIERNES_EXPONENTIAL_BACKOFF !== 'false',
};

/**
 * Queued Request Item
 */
interface QueuedRequest {
  request: ViernesSimulationRequest;
  onProgress?: (status: string) => void;
  resolve: (value: ViernesSimulationResponse) => void;
  reject: (error: any) => void;
  attempts: number;
  maxAttempts: number;
  retryDelay: number;
}

/**
 * Queue for handling 429 (Too Many Requests) errors
 * Automatically retries with exponential backoff
 * Supports concurrent execution with configurable concurrency limit
 */
export class ViernesQueue {
  private queue: QueuedRequest[] = [];
  private activeRequests = 0;
  private maxConcurrency: number;
  private maxQueueSize: number;
  private processing = false;
  private executeRequest: (
    request: ViernesSimulationRequest,
    onProgress?: (status: string) => void
  ) => Promise<ViernesSimulationResponse>;

  constructor(
    executeRequest: (
      request: ViernesSimulationRequest,
      onProgress?: (status: string) => void
    ) => Promise<ViernesSimulationResponse>,
    maxConcurrency: number = 3,
    maxQueueSize: number = 100
  ) {
    // Validate maxConcurrency
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error(`maxConcurrency must be a positive integer, got: ${maxConcurrency}`);
    }

    // Validate maxQueueSize
    if (!Number.isInteger(maxQueueSize) || maxQueueSize < 1) {
      throw new Error(`maxQueueSize must be a positive integer, got: ${maxQueueSize}`);
    }

    this.executeRequest = executeRequest;
    this.maxConcurrency = maxConcurrency;
    this.maxQueueSize = maxQueueSize;

    // Log retry configuration
    console.log(`[ViernesQueue] Retry config: ${RETRY_CONFIG.maxAttempts} attempts, ` +
      `${RETRY_CONFIG.baseDelay / 1000}s base delay, ` +
      `${RETRY_CONFIG.maxDelay / 1000}s max delay, ` +
      `exponential backoff: ${RETRY_CONFIG.useExponentialBackoff}`);

    // Cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Enqueue a request for execution
   */
  async enqueue(
    request: ViernesSimulationRequest,
    onProgress?: (status: string) => void
  ): Promise<ViernesSimulationResponse> {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      throw new ViernesAPIError(
        `Queue is full (${this.maxQueueSize} items). Please try again later.`,
        429,
        { queue_size: this.queue.length }
      );
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        request,
        onProgress,
        resolve,
        reject,
        attempts: 0,
        maxAttempts: RETRY_CONFIG.maxAttempts,
        retryDelay: RETRY_CONFIG.baseDelay,
      });

      this.processQueue();
    });
  }

  /**
   * Process the queue with concurrent execution
   * Protected against race conditions with processing flag
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent queue processing (critical section)
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      // Process multiple items concurrently up to maxConcurrency
      while (this.activeRequests < this.maxConcurrency && this.queue.length > 0) {
        const item = this.queue.shift();

        // Double-check after shift to handle race conditions
        if (!item) {
          break;
        }

        this.activeRequests++;

        // Process item without blocking queue processing
        this.processItem(item).finally(() => {
          this.activeRequests--;
          // Continue processing if there are more items
          if (this.queue.length > 0) {
            this.processQueue();
          }
        });
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single queued item
   */
  private async processItem(item: QueuedRequest): Promise<void> {
    try {
      item.onProgress?.(
        `Processing (${this.activeRequests}/${this.maxConcurrency} active, ${this.queue.length} queued) ` +
        `(attempt ${item.attempts + 1}/${item.maxAttempts})`
      );

      const result = await this.executeRequest(item.request, item.onProgress);
      item.resolve(result);
    } catch (error: any) {
      // Check if it's a 429 error and we have attempts left
      if (this.is429Error(error) && item.attempts < item.maxAttempts) {
        item.attempts++;

        // Calculate delay with optional exponential backoff
        let currentDelay = item.retryDelay;
        if (RETRY_CONFIG.useExponentialBackoff) {
          // Exponential backoff: baseDelay * 2^(attempt-1) with jitter
          const exponentialDelay = RETRY_CONFIG.baseDelay * Math.pow(1.5, item.attempts - 1);
          const jitter = Math.random() * 0.2 * exponentialDelay; // 0-20% jitter
          currentDelay = Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelay);
        }

        item.onProgress?.(
          `Concurrency limit reached. Attempt ${item.attempts}/${item.maxAttempts}. ` +
          `Waiting ${(currentDelay / 1000).toFixed(0)}s before retry...`
        );

        // Schedule retry without blocking (use setTimeout instead of await sleep)
        setTimeout(() => {
          this.queue.push(item);
          this.processQueue();
        }, currentDelay);
      } else {
        // Max attempts exceeded or different error - reject
        if (item.attempts >= item.maxAttempts) {
          item.reject(
            new ViernesAPIError(
              `Failed after ${item.maxAttempts} retry attempts due to concurrency limits`,
              429,
              { attempts: item.attempts }
            )
          );
        } else {
          item.reject(error);
        }
      }
    }
  }

  /**
   * Check if error is a 429 (Too Many Requests)
   */
  private is429Error(error: any): boolean {
    return (
      error instanceof ViernesAPIError &&
      error.statusCode === 429
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean {
    return this.activeRequests > 0 || this.queue.length > 0;
  }

  /**
   * Get number of active requests
   */
  getActiveRequests(): number {
    return this.activeRequests;
  }

  /**
   * Cleanup pending requests on process exit
   */
  private cleanup(): void {
    const error = new Error('Process terminating - queue cleanup');
    this.queue.forEach(item => item.reject(error));
    this.queue = [];
  }
}
