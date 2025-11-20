/**
 * Provider para Vapi usando Evals API
 * Implementa la interfaz TestProvider para tests de Vapi
 *
 * NOTA: Test Suites no existen en la API de Vapi, solo en la UI.
 * Esta implementación usa Evals API con conversaciones mock.
 */

import ora, { Ora } from 'ora';
import { BaseTestProvider } from './base-provider.js';
import { VapiClient } from '../api/vapi-client.js';
import { VapiAdapter } from '../adapters/vapi-adapter.js';
import type { TestDefinition, TestResult } from '../types/index.js';
import type { VapiConfig, EvalRun } from '../types/vapi.types.js';

export class VapiProvider extends BaseTestProvider {
  readonly name = 'vapi';
  private client: VapiClient;
  private adapter: VapiAdapter;
  private config: VapiConfig;

  constructor(config: VapiConfig) {
    super();
    this.config = config;
    this.client = new VapiClient(config);
    this.adapter = new VapiAdapter();
  }

  /**
   * Ejecuta un test de Vapi usando Evals API
   */
  async executeTest(test: TestDefinition): Promise<TestResult> {
    // Validar test
    this.validateTest(test);

    const spinner = ora('Preparing Vapi eval...').start();

    try {
      const assistantId = this.client.getAssistantId(test.vapi?.assistant_id);
      console.log(`[VapiProvider] Test: "${test.name}", Assistant: ${assistantId}`);

      // 1. Convertir test a Eval (puede generar conversación con LLM)
      spinner.text = 'Converting test to eval...';
      console.log('[VapiProvider] Step 1: Converting test definition...');

      const evalDto = await this.adapter.convertTestDefinition(test, assistantId);
      console.log('[VapiProvider] Eval DTO created:', {
        name: evalDto.name,
        type: evalDto.type,
        messageCount: evalDto.messages.length,
      });

      spinner.succeed('Eval definition ready');

      // 2. Determinar si es persistente o transiente
      const persistent = test.vapi?.persistent_eval ?? false;
      console.log(`[VapiProvider] Mode: ${persistent ? 'persistent' : 'transient'}`);

      // 3. Ejecutar eval
      spinner.start(persistent ? 'Creating and running eval...' : 'Running transient eval...');
      console.log('[VapiProvider] Step 2: Running eval...');

      let evalRunId: string;

      try {
        if (persistent) {
          // Crear eval primero, luego ejecutar
          console.log('[VapiProvider] Creating persistent eval...');
          const eval_ = await this.client.createEval(evalDto);
          spinner.text = `Eval created: ${eval_.id}`;
          console.log('[VapiProvider] Eval created:', eval_.id);

          console.log('[VapiProvider] Running eval...');
          evalRunId = await this.client.runEval({
            evalId: eval_.id,
            assistantId,
          });
        } else {
          // Eval transiente (recomendado)
          console.log('[VapiProvider] Running transient eval...');
          evalRunId = await this.client.runEval({
            eval: evalDto,
            assistantId,
          });
        }

        console.log('[VapiProvider] Eval run started:', evalRunId);
        spinner.text = `Eval run started: ${evalRunId}`;
      } catch (runError: any) {
        console.error('[VapiProvider] Error running eval:', runError);
        throw runError;
      }

      // 4. Poll para resultados
      console.log('[VapiProvider] Step 3: Polling for results...');
      spinner.text = `Waiting for results (run: ${evalRunId})...`;

      const evalRun = await this.client.pollEvalRun(evalRunId, {
        interval: 3000,  // 3 segundos
        timeout: 120000,  // 2 minutos (reducido para debug)
        onProgress: (status) => {
          console.log(`[VapiProvider] Poll status: ${status}`);
          spinner.text = `Status: ${status}...`;
        },
      });

      console.log('[VapiProvider] Eval run completed:', {
        id: evalRun.id,
        status: evalRun.status,
        resultsCount: evalRun.results?.length || 0,
      });

      spinner.succeed('Eval completed');

      // 5. Convertir resultados a formato unificado
      console.log('[VapiProvider] Step 4: Converting results...');
      const testResult = this.adapter.convertEvalRunToTestResult(evalRun, test);
      console.log('[VapiProvider] Test result:', {
        success: testResult.success,
        executionTime: testResult.execution_time_ms,
      });

      return testResult;
    } catch (error: any) {
      console.error('[VapiProvider] ERROR in executeTest:', {
        name: test.name,
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3),
      });
      spinner.fail('Eval failed');
      throw new Error(`Vapi eval execution failed: ${error.message}`);
    }
  }

  /**
   * Ejecuta un test con múltiples intentos
   */
  async executeWithAttempts(test: TestDefinition): Promise<TestResult[]> {
    const attempts = test.vapi?.attempts || 1;
    const results: TestResult[] = [];

    console.log(`\nExecuting test with ${attempts} attempt(s):`);

    for (let i = 0; i < attempts; i++) {
      console.log(`\n  Attempt ${i + 1}/${attempts}:`);

      try {
        const result = await this.executeTest(test);
        results.push(result);

        // Mostrar resultado del intento
        const status = result.success ? '✓ PASSED' : '✗ FAILED';
        console.log(`  ${status} (${result.execution_time_ms}ms)`);
      } catch (error: any) {
        console.log(`  ✗ ERROR: ${error.message}`);
        // Agregar resultado fallido
        results.push(this.createFailedResult(test, error.message));
      }
    }

    // Mostrar resumen si hay múltiples intentos
    if (attempts > 1) {
      const passedCount = results.filter(r => r.success).length;
      const passRate = (passedCount / attempts) * 100;
      console.log(`\n  Overall: ${passedCount}/${attempts} passed (${passRate.toFixed(1)}%)`);
    }

    return results;
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
      version: '2.0.0',  // v2 con Evals API
      capabilities: [
        'chat-testing',
        'evals-api',
        'hybrid-conversation-generation',
        'ai-judges',
        'multi-attempt-runs',
        'async-execution',
        'persistent-and-transient-evals',
      ],
    };
  }

  /**
   * Ejecuta múltiples tests en paralelo con límite de concurrencia
   */
  async executeBatch(tests: TestDefinition[]): Promise<TestResult[]> {
    const CONCURRENCY_LIMIT = 3;  // No sobrecargar la API de Vapi
    const results: TestResult[] = [];

    console.log(`\nExecuting ${tests.length} test(s) with concurrency limit: ${CONCURRENCY_LIMIT}`);

    // Procesar en chunks
    for (let i = 0; i < tests.length; i += CONCURRENCY_LIMIT) {
      const chunk = tests.slice(i, i + CONCURRENCY_LIMIT);

      console.log(`\nBatch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}: Running ${chunk.length} test(s)...`);

      // Ejecutar chunk en paralelo
      const chunkResults = await Promise.allSettled(
        chunk.map(test => this.executeTest(test))
      );

      // Procesar resultados
      for (let j = 0; j < chunkResults.length; j++) {
        const result = chunkResults[j];
        const test = chunk[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`  Test "${test.name}" failed:`, result.reason?.message);
          results.push(this.createFailedResult(test, result.reason?.message));
        }
      }
    }

    return results;
  }

  /**
   * Crea un resultado fallido para un test
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
      error: errorMessage,
    };
  }

  /**
   * Valida que el test tenga la configuración necesaria para Vapi
   */
  protected validateTest(test: TestDefinition): void {
    if (!test.vapi?.assistant_id && !this.config.assistantId) {
      throw new Error(
        'Test must specify vapi.assistant_id or provider must have default assistantId'
      );
    }

    // Si no hay conversation_turns manuales, debe tener simulated_user
    if (!test.vapi?.conversation_turns || test.vapi.conversation_turns.length === 0) {
      if (!test.simulated_user?.prompt || !test.simulated_user?.first_message) {
        throw new Error(
          'Test must have either vapi.conversation_turns OR ' +
          '(simulated_user.prompt + simulated_user.first_message)'
        );
      }
    }

    // Debe tener criterios de evaluación
    if (!test.evaluation_criteria || test.evaluation_criteria.length === 0) {
      throw new Error('Test must have at least one evaluation_criteria');
    }
  }
}
