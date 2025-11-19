/**
 * Provider para Vapi
 * Implementa la interfaz TestProvider para tests de Vapi
 */

import ora from 'ora';
import { BaseTestProvider } from './base-provider.js';
import { VapiClient } from '../api/vapi-client.js';
import { VapiAdapter } from '../adapters/vapi-adapter.js';
import { VapiTestSuiteManager } from '../vapi/suite-manager.js';
import type { TestDefinition, TestResult } from '../types/index.js';
import type { VapiConfig, VapiTest } from '../types/vapi.types.js';

export class VapiProvider extends BaseTestProvider {
  readonly name = 'vapi';
  private client: VapiClient;
  private adapter: VapiAdapter;
  private suiteManager: VapiTestSuiteManager;
  private config: VapiConfig;

  constructor(config: VapiConfig) {
    super();
    this.config = config;
    this.client = new VapiClient(config);
    this.adapter = new VapiAdapter();
    this.suiteManager = new VapiTestSuiteManager(
      this.client,
      config.defaultSuite || 'conversational-agent-testing'
    );
  }

  /**
   * Ejecuta un test en Vapi
   */
  async executeTest(test: TestDefinition): Promise<TestResult> {
    // Validar test
    this.validateTest(test);

    const spinner = ora('Setting up Vapi test...').start();

    try {
      // 1. Determinar/crear suite automáticamente
      spinner.text = 'Determining test suite...';
      const suiteId = await this.suiteManager.getSuiteForTest(test);
      const suiteName = test.category || test.tags?.[0] || 'default';
      spinner.succeed(`Using suite: ${suiteName}`);

      // 2. Convertir test definition a formato Vapi
      spinner.start('Converting test configuration...');
      const assistantId = this.client.getAssistantId(test.vapi?.assistant_id);
      const vapiConfig = this.adapter.convertTestDefinition(test, assistantId);
      spinner.succeed('Test configuration ready');

      // 3. Crear test en suite
      spinner.start('Creating test in Vapi...');
      const vapiTest = await this.client.createTest(suiteId, vapiConfig);
      spinner.succeed(`Test created: ${vapiTest.id}`);

      // 4. Ejecutar suite
      spinner.start('Running test suite...');
      const run = await this.client.runTestSuite(suiteId);
      spinner.text = `Test run started: ${run.id}`;

      // 5. Poll para resultados (async)
      spinner.text = 'Waiting for results...';
      const results = await this.client.pollTestRun(run.id, {
        interval: 2000,
        timeout: 300000,  // 5 minutos
        onProgress: (status) => {
          spinner.text = `Status: ${status}...`;
        },
      });

      spinner.succeed('Test completed');

      // 6. Convertir a formato unificado
      const testResult = this.adapter.convertResults(results, test);

      // 7. Cleanup: eliminar test temporal (opcional)
      // await this.client.deleteTest(suiteId, vapiTest.id);

      return testResult;
    } catch (error: any) {
      spinner.fail('Test failed');
      throw new Error(`Vapi test execution failed: ${error.message}`);
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
        'test-suites',
        'multi-attempt-runs',
        'async-execution',
      ],
    };
  }

  /**
   * Ejecuta múltiples tests en paralelo (sobrescribe implementación base)
   */
  async executeBatch(tests: TestDefinition[]): Promise<TestResult[]> {
    // Agrupar tests por suite para eficiencia
    const testsBySuite = await this.groupTestsBySuite(tests);

    const results: TestResult[] = [];

    // Ejecutar cada suite
    for (const [suiteId, suiteTests] of testsBySuite) {
      try {
        const suiteResults = await this.executeTestsInSuite(suiteId, suiteTests);
        results.push(...suiteResults);
      } catch (error: any) {
        console.error(`Failed to execute suite ${suiteId}:`, error.message);
        // Agregar resultados fallidos
        for (const test of suiteTests) {
          results.push(this.createFailedResult(test, error.message));
        }
      }
    }

    return results;
  }

  /**
   * Agrupa tests por suite para ejecución eficiente
   */
  private async groupTestsBySuite(
    tests: TestDefinition[]
  ): Promise<Map<string, TestDefinition[]>> {
    const grouped = new Map<string, TestDefinition[]>();

    for (const test of tests) {
      const suiteId = await this.suiteManager.getSuiteForTest(test);

      if (!grouped.has(suiteId)) {
        grouped.set(suiteId, []);
      }

      grouped.get(suiteId)!.push(test);
    }

    return grouped;
  }

  /**
   * Ejecuta todos los tests de un suite
   */
  private async executeTestsInSuite(
    suiteId: string,
    tests: TestDefinition[]
  ): Promise<TestResult[]> {
    const spinner = ora(`Creating ${tests.length} tests in suite...`).start();

    try {
      // Crear todos los tests
      const vapiTests: Array<{ vapiTest: VapiTest; originalTest: TestDefinition }> = [];
      for (const test of tests) {
        const assistantId = this.client.getAssistantId(test.vapi?.assistant_id);
        const vapiConfig = this.adapter.convertTestDefinition(test, assistantId);
        const vapiTest = await this.client.createTest(suiteId, vapiConfig);
        vapiTests.push({ vapiTest, originalTest: test });
      }

      spinner.succeed(`Created ${vapiTests.length} tests`);

      // Ejecutar suite
      spinner.start('Running test suite...');
      const run = await this.client.runTestSuite(suiteId);

      // Esperar resultados
      const results = await this.client.pollTestRun(run.id, {
        interval: 2000,
        timeout: 600000,  // 10 minutos para batch
        onProgress: (status) => {
          spinner.text = `Suite status: ${status}...`;
        },
      });

      spinner.succeed('Suite completed');

      // Convertir resultados
      const testResults: TestResult[] = [];
      for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        // Encontrar resultado correspondiente
        const vapiResult = results.tests.find(
          t => t.testId === vapiTests[i].vapiTest.id
        );

        if (vapiResult) {
          // Crear un VapiTestRun temporal para el adaptador
          const tempRun = {
            ...results,
            tests: [vapiResult],
          };
          testResults.push(this.adapter.convertResults(tempRun, test));
        } else {
          testResults.push(this.createFailedResult(test, 'No result found'));
        }
      }

      return testResults;
    } catch (error: any) {
      spinner.fail('Suite execution failed');
      throw error;
    }
  }

  /**
   * Crea un resultado fallido
   */
  private createFailedResult(test: TestDefinition, errorMessage: string): TestResult {
    return {
      test_name: test.name,
      agent_id: test.vapi?.assistant_id || test.agent_id,
      timestamp: new Date().toISOString(),
      success: false,
      simulation_response: {
        simulated_conversation: [],
        analysis: {
          evaluation_criteria_results: {},
          data_collection_results: {},
          call_success: false,
          transcript_summary: `Error: ${errorMessage}`,
        },
      },
      execution_time_ms: 0,
    };
  }

  /**
   * Obtiene estadísticas de los suites
   */
  async getSuiteStats() {
    return this.suiteManager.getStats();
  }

  /**
   * Sincroniza el caché de suites con la API
   */
  async syncSuites() {
    return this.suiteManager.syncWithAPI();
  }

  /**
   * Limpia el caché de suites
   */
  async clearSuiteCache() {
    return this.suiteManager.clearCache();
  }
}
