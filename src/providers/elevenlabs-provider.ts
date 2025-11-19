/**
 * Provider para ElevenLabs
 * Implementa la interfaz TestProvider para tests de ElevenLabs
 */

import { BaseTestProvider } from './base-provider.js';
import { ElevenLabsClient } from '../api/elevenlabs-client.js';
import { ElevenLabsAdapter } from '../adapters/elevenlabs-adapter.js';
import type { TestDefinition, TestResult, ElevenLabsConfig } from '../types/index.js';

export class ElevenLabsProvider extends BaseTestProvider {
  readonly name = 'elevenlabs';
  private client: ElevenLabsClient;
  private adapter: ElevenLabsAdapter;
  private config: ElevenLabsConfig;

  constructor(config: ElevenLabsConfig) {
    super();
    this.config = config;
    this.client = new ElevenLabsClient(config);
    this.adapter = new ElevenLabsAdapter();
  }

  /**
   * Ejecuta un test en ElevenLabs
   */
  async executeTest(test: TestDefinition): Promise<TestResult> {
    // Validar test
    this.validateTest(test);

    const startTime = Date.now();

    try {
      // Convertir test definition a formato de API de ElevenLabs
      const simulationSpec = this.adapter.convertTestDefinition(test);

      // Ejecutar simulación
      const response = await this.client.simulateConversation(
        test.agent_id,
        simulationSpec
      );

      const executionTime = Date.now() - startTime;

      // Determinar éxito basado en criterios de evaluación
      const evaluationResults = response.analysis.evaluation_criteria_results;
      const criteriaCount = Object.keys(evaluationResults).length;
      const successCount = Object.values(evaluationResults).filter(
        r => r.result === 'success'
      ).length;
      const success = criteriaCount === 0 || successCount === criteriaCount;

      // Construir resultado
      const result: TestResult = {
        test_name: test.name,
        agent_id: test.agent_id,
        timestamp: new Date().toISOString(),
        success,
        simulation_response: response,
        execution_time_ms: executionTime,
      };

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Retornar resultado fallido
      return {
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
        execution_time_ms: executionTime,
      };
    }
  }

  /**
   * Verifica si el provider está configurado correctamente
   */
  isConfigured(): boolean {
    return !!(this.config.apiKey);
  }

  /**
   * Información sobre el provider
   */
  getInfo() {
    return {
      name: this.name,
      version: '1.0.0',
      capabilities: [
        'chat-testing',
        'voice-testing',
        'direct-simulation',
        'knowledge-base',
        'tool-mocking',
      ],
    };
  }

  /**
   * Ejecuta múltiples tests secuencialmente
   * ElevenLabs no tiene concepto de test suites, por lo que ejecutamos uno por uno
   */
  async executeBatch(tests: TestDefinition[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const result = await this.executeTest(test);
        results.push(result);
      } catch (error: any) {
        // Agregar resultado fallido
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
   * Obtiene el cliente de ElevenLabs
   * Útil para operaciones avanzadas fuera del flujo de testing
   */
  getClient(): ElevenLabsClient {
    return this.client;
  }
}
