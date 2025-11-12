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
