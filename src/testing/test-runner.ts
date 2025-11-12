import { readFile, readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { parse as parseYAML } from 'yaml';
import { ElevenLabsClient } from '../api/elevenlabs-client.js';
import { TestDefinitionSchema, TestValidationError } from '../validation/schemas.js';
import { validateFilePath } from '../utils/path-validator.js';
import type {
  TestDefinition,
  TestResult,
  SimulationSpecification,
} from '../types/index.js';

/**
 * Clase para ejecutar tests de agentes de ElevenLabs
 */
export class TestRunner {
  private client: ElevenLabsClient;
  private testsDir: string;

  constructor(client: ElevenLabsClient, testsDir: string = './tests/scenarios') {
    this.client = client;
    this.testsDir = testsDir;
  }

  /**
   * Carga un test desde un archivo YAML
   * @param filePath - Ruta del archivo YAML a cargar
   * @throws PathValidationError si la ruta es inválida o intenta acceder fuera del directorio de tests
   * @throws TestValidationError si el contenido del YAML no es válido
   */
  async loadTest(filePath: string): Promise<TestDefinition> {
    // Validar que la ruta no sea maliciosa (prevenir path traversal)
    const baseDir = resolve(this.testsDir);
    await validateFilePath(filePath, baseDir);

    const content = await readFile(filePath, 'utf-8');
    const parsedYAML = parseYAML(content);

    // Validar el YAML con Zod
    const validationResult = TestDefinitionSchema.safeParse(parsedYAML);

    if (!validationResult.success) {
      throw new TestValidationError(validationResult.error);
    }

    const test = validationResult.data as TestDefinition;

    // Reemplazar variables de entorno en agent_id
    if (test.agent_id && test.agent_id.includes('${')) {
      test.agent_id = this.replaceEnvVars(test.agent_id);
    }

    return test;
  }

  /**
   * Reemplaza variables de entorno en una cadena
   */
  private replaceEnvVars(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
  }

  /**
   * Carga todos los tests del directorio de escenarios
   */
  async loadAllTests(): Promise<TestDefinition[]> {
    const files = await readdir(this.testsDir);
    const yamlFiles = files.filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml')
    );

    const tests: TestDefinition[] = [];
    for (const file of yamlFiles) {
      const filePath = join(this.testsDir, file);
      const test = await this.loadTest(filePath);
      tests.push(test);
    }

    return tests;
  }

  /**
   * Ejecuta un test usando simulación directa
   */
  async runSimulation(test: TestDefinition): Promise<TestResult> {
    const startTime = Date.now();

    // Convertir evaluation_criteria al formato correcto
    const evaluationCriteria: import('../types/index.js').EvaluationCriterion[] =
      (test.evaluation_criteria || []).map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        type: 'prompt' as const,
        conversation_goal_prompt: criterion.prompt || criterion.conversation_goal_prompt || '',
        use_knowledge_base: criterion.use_knowledge_base ?? false,
      }));

    // Convertir simulated_user del formato YAML al formato API
    const simulatedUserConfig: import('../types/index.js').SimulatedUserConfig = {
      prompt: {
        prompt: test.simulated_user.prompt,
        llm: test.simulated_user.llm || 'gpt-4o',
        temperature: test.simulated_user.temperature ?? 0.7,
        max_tokens: test.simulated_user.max_tokens,
      },
      first_message: test.simulated_user.first_message,
      language: test.simulated_user.language,
      tools: test.simulated_user.tools,
    };

    // Construir la especificación de simulación
    const specification: SimulationSpecification = {
      simulation_specification: {
        simulated_user_config: simulatedUserConfig,
        dynamic_variables: test.dynamic_variables,
        tool_mock_config: test.tool_mock_config,
        partial_conversation_history: test.partial_conversation_history,
      },
      extra_evaluation_criteria: evaluationCriteria,
      new_turns_limit: test.new_turns_limit,
    };

    // Ejecutar la simulación
    const response = await this.client.simulateConversation(
      test.agent_id,
      specification
    );

    const executionTime = Date.now() - startTime;

    // Determinar si el test fue exitoso
    // evaluation_criteria_results es un objeto, no array
    const criteriaResults = Object.values(response.analysis.evaluation_criteria_results);
    const success = criteriaResults.every(
      (result) => result.result === 'success'
    );

    return {
      test_name: test.name,
      agent_id: test.agent_id,
      timestamp: new Date().toISOString(),
      success,
      simulation_response: response,
      execution_time_ms: executionTime,
    };
  }

  /**
   * Ejecuta todos los tests cargados usando simulación
   */
  async runAllSimulations(): Promise<TestResult[]> {
    const tests = await this.loadAllTests();
    const allResults: TestResult[] = [];

    for (const test of tests) {
      console.log(`\n=== Ejecutando test: ${test.name} ===`);
      const result = await this.runSimulation(test);
      allResults.push(result);
    }

    return allResults;
  }

  /**
   * Crea un test persistente en ElevenLabs
   */
  async createPersistentTest(
    test: TestDefinition
  ): Promise<import('../types/index.js').CreateTestResponse> {
    // Convertir el formato de test a formato de API
    const chatHistory = test.partial_conversation_history || [
      {
        role: 'user' as const,
        message: test.simulated_user.first_message,
        time_in_call_secs: 0,
      },
    ];

    const request: import('../types/index.js').CreatePersistentTestRequest = {
      name: test.name,
      chat_history: chatHistory.map((turn, index) => ({
        role: turn.role,
        message: turn.message || '',
        time_in_call_secs: index * 5,
      })),
      success_condition:
        test.success_condition ||
        test.evaluation_criteria?.map((c) => c.prompt || c.conversation_goal_prompt).join('\n') ||
        'El agente debe responder apropiadamente',
      success_examples: (test.success_examples || ['Respuesta clara y profesional']).map((ex) =>
        typeof ex === 'string' ? { response: ex, type: 'success' } : ex
      ),
      failure_examples: (test.failure_examples || ['Respuesta confusa o inapropiada']).map((ex) =>
        typeof ex === 'string' ? { response: ex, type: 'failure' } : ex
      ),
      type: test.type,
      dynamic_variables: test.dynamic_variables,
    };

    return await this.client.createPersistentTest(request);
  }

  /**
   * Crea todos los tests como persistentes en ElevenLabs
   */
  async createAllPersistentTests(): Promise<
    import('../types/index.js').CreateTestResponse[]
  > {
    const tests = await this.loadAllTests();
    const createdTests: import('../types/index.js').CreateTestResponse[] = [];

    for (const test of tests) {
      console.log(`Creando test persistente "${test.name}"...`);
      const created = await this.createPersistentTest(test);
      createdTests.push(created);
    }

    return createdTests;
  }

  /**
   * Ejecuta tests persistentes
   */
  async runPersistentTests(
    agentId: string,
    testIds: string[]
  ): Promise<import('../types/index.js').TestSuiteInvocation> {
    return await this.client.runPersistentTests(agentId, testIds);
  }
}
