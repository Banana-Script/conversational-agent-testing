/**
 * Interfaz base para providers de testing
 * Define el contrato que todos los providers deben implementar
 */

import type { TestDefinition, TestResult } from '../types/index.js';

/**
 * Interfaz que todos los providers deben implementar
 */
export interface TestProvider {
  /**
   * Nombre del provider (ej: 'elevenlabs', 'vapi')
   */
  readonly name: string;

  /**
   * Ejecuta un test individual
   * @param test Definición del test a ejecutar
   * @returns Resultado del test
   */
  executeTest(test: TestDefinition): Promise<TestResult>;

  /**
   * Ejecuta múltiples tests en batch
   * @param tests Array de definiciones de tests
   * @returns Array de resultados
   */
  executeBatch(tests: TestDefinition[]): Promise<TestResult[]>;

  /**
   * Verifica si el provider está correctamente configurado
   * @returns true si está listo para ejecutar tests
   */
  isConfigured(): boolean;

  /**
   * Obtiene información sobre el provider
   */
  getInfo(): {
    name: string;
    version?: string;
    capabilities: string[];
  };
}

/**
 * Clase base abstracta para providers
 * Proporciona implementación común para algunos métodos
 */
export abstract class BaseTestProvider implements TestProvider {
  abstract readonly name: string;

  /**
   * Implementación de executeTest que debe ser sobreescrita
   */
  abstract executeTest(test: TestDefinition): Promise<TestResult>;

  /**
   * Implementación de isConfigured que debe ser sobreescrita
   */
  abstract isConfigured(): boolean;

  /**
   * Implementación por defecto de executeBatch
   * Ejecuta tests secuencialmente
   * Los providers pueden sobrescribir para ejecución paralela
   */
  async executeBatch(tests: TestDefinition[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const result = await this.executeTest(test);
        results.push(result);
      } catch (error: any) {
        // En caso de error, crear un resultado fallido
        results.push({
          test_name: test.name,
          agent_id: test.agent_id,
          timestamp: new Date().toISOString(),
          success: false,
          simulation_response: {
            simulated_conversation: [],
            analysis: {
              evaluation_criteria_results: {},
              data_collection_results: {},
              call_success: false,
              transcript_summary: `Error: ${error.message}`,
            },
          },
          execution_time_ms: 0,
        });
      }
    }

    return results;
  }

  /**
   * Implementación por defecto de getInfo
   */
  getInfo(): { name: string; version?: string; capabilities: string[] } {
    return {
      name: this.name,
      capabilities: ['basic-testing'],
    };
  }

  /**
   * Valida que un test tenga los campos requeridos
   */
  protected validateTest(test: TestDefinition): void {
    if (!test.name) {
      throw new Error('Test name is required');
    }

    if (!test.simulated_user) {
      throw new Error('Simulated user configuration is required');
    }

    if (!test.simulated_user.prompt) {
      throw new Error('Simulated user prompt is required');
    }

    if (!test.simulated_user.first_message) {
      throw new Error('Simulated user first_message is required');
    }
  }
}
