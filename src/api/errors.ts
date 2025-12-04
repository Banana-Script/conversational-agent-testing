/**
 * Error personalizado para errores de la API de ElevenLabs
 * Preserva el stack trace original y proporciona información estructurada del error
 */
export class ElevenLabsAPIError extends Error {
  public readonly statusCode?: number;
  public readonly responseData?: {
    error?: string;
    message?: string;
    detail?: unknown;
  };
  public readonly originalError?: Error;

  constructor(
    message: string,
    statusCode?: number,
    responseData?: unknown,
    originalError?: Error
  ) {
    super(message);
    this.name = 'ElevenLabsAPIError';
    this.statusCode = statusCode;

    // Extraer solo información segura del responseData
    if (responseData && typeof responseData === 'object') {
      const data = responseData as Record<string, unknown>;
      this.responseData = {
        error: typeof data.error === 'string' ? data.error : undefined,
        message: typeof data.message === 'string' ? data.message : undefined,
        detail: data.detail,
      };
    }

    this.originalError = originalError;

    // Preservar stack trace original si existe
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }

    // Mantener prototipo correcto para instanceof
    Object.setPrototypeOf(this, ElevenLabsAPIError.prototype);
  }

  /**
   * Retorna una representación amigable del error para logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      responseData: this.responseData,
      stack: this.stack,
    };
  }

  /**
   * Retorna true si el error es retryable (5xx, timeouts, errores de red)
   */
  isRetryable(): boolean {
    if (!this.statusCode) {
      // Errores de red sin statusCode son retryables
      return true;
    }

    // Solo errores 5xx son retryables
    return this.statusCode >= 500 && this.statusCode < 600;
  }
}

/**
 * Error personalizado para errores de la API de Viernes
 * Preserva el stack trace original y proporciona información estructurada del error
 */
export class ViernesAPIError extends Error {
  public readonly statusCode?: number;
  public readonly responseData?: any;
  public readonly originalError?: Error;

  constructor(
    message: string,
    statusCode?: number,
    responseData?: any,
    originalError?: Error
  ) {
    super(message);
    this.name = 'ViernesAPIError';
    this.statusCode = statusCode;
    this.responseData = responseData;
    this.originalError = originalError;

    // Preservar stack trace original si existe
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }

    // Mantener prototipo correcto para instanceof
    Object.setPrototypeOf(this, ViernesAPIError.prototype);
  }

  /**
   * Retorna una representación amigable del error para logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      responseData: this.responseData,
      stack: this.stack,
    };
  }

  /**
   * Retorna true si el error es retryable (5xx, timeouts, errores de red)
   */
  isRetryable(): boolean {
    if (!this.statusCode) {
      // Errores de red sin statusCode son retryables
      return true;
    }

    // Solo errores 5xx son retryables
    return this.statusCode >= 500 && this.statusCode < 600;
  }

  /**
   * Check if error is a concurrency error (429)
   */
  isConcurrencyError(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if error is simulation not found (404)
   */
  isSimulationNotFound(): boolean {
    return this.statusCode === 404;
  }

  /**
   * Check if error is timeout (408, 504)
   */
  isTimeout(): boolean {
    return this.statusCode === 408 || this.statusCode === 504;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    if (this.isConcurrencyError()) {
      return 'Too many active simulations. Waiting in queue...';
    }
    if (this.isSimulationNotFound()) {
      return 'Simulation not found or expired (results expire after 1 hour).';
    }
    if (this.isTimeout()) {
      return 'Simulation timeout. The simulation may still be running on server.';
    }
    return this.message;
  }
}
