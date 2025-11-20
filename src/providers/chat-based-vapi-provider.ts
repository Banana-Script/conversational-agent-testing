/**
 * Provider para Vapi usando Chat API + OpenAI
 *
 * Sistema completo:
 * 1. Genera conversaciones de usuario con OpenAI (VAPI_EVAL_GENERATOR_MODEL)
 * 2. Ejecuta conversaciones multi-turno REALES con Vapi Chat API
 * 3. Evalúa criterios con OpenAI (VAPI_EVAL_JUDGE_MODEL)
 *
 * Ventajas vs VapiProvider (Evals):
 * - Conversaciones completas (5-15 turnos vs 1 turno)
 * - Respuestas reales del assistant (no pre-generadas)
 * - Evaluación local con OpenAI (vs Vapi AI judges)
 * - Mejor calidad y control de evaluaciones
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  TestDefinition,
  TestResult,
  ConversationTurn,
  TestEvaluationCriterion,
  EvaluationResult,
} from '../types/index.js';
import { BaseTestProvider } from './base-provider.js';
import { VapiClient, type ChatMessage } from '../api/vapi-client.js';
import { OpenAIClient } from '../api/openai-client.js';

export interface ChatBasedVapiConfig {
  apiKey: string;
  assistantId?: string;
  verbose?: boolean;
  generatorModel?: string;
  judgeModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export class ChatBasedVapiProvider extends BaseTestProvider {
  readonly name = 'vapi-chat';
  private vapiClient: VapiClient;
  private llmClient: OpenAIClient;
  private conversationGeneratorPrompt: string;
  private criterionEvaluatorPrompt: string;

  constructor(config: ChatBasedVapiConfig) {
    super();

    // Inicializar cliente de Vapi
    this.vapiClient = new VapiClient({
      apiKey: config.apiKey,
      assistantId: config.assistantId,
    });

    // Inicializar cliente de OpenAI
    this.llmClient = new OpenAIClient({
      generatorModel: config.generatorModel,
      judgeModel: config.judgeModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      verbose: config.verbose || false,
    });

    // Cargar prompts
    this.conversationGeneratorPrompt = this.loadPrompt('conversation-generator.md');
    this.criterionEvaluatorPrompt = this.loadPrompt('criterion-evaluator.md');
  }

  /**
   * Carga un archivo de prompt desde /prompts
   */
  private loadPrompt(filename: string): string {
    const promptPath = join(process.cwd(), 'prompts', filename);
    try {
      return readFileSync(promptPath, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to load prompt ${filename}: ${error.message}`);
    }
  }

  /**
   * Interpola variables en un template
   */
  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Ejecuta un test completo
   */
  async executeTest(test: TestDefinition): Promise<TestResult> {
    // Validar test
    this.validateTest(test);
    const startTime = Date.now();

    try {
      console.log(`\n[ChatBasedVapiProvider] Running test: "${test.name}"`);
      console.log(`[ChatBasedVapiProvider] Assistant ID: ${test.vapi?.assistant_id || test.agent_id}`);

      // 1. Generar mensajes de usuario con Claude Code
      console.log('[ChatBasedVapiProvider] Step 1: Generating user messages with Claude Code...');
      const userMessages = await this.generateUserMessages(test);
      console.log(`[ChatBasedVapiProvider] Generated ${userMessages.length} user messages`);

      // 2. Ejecutar conversación REAL con Vapi Chat API
      console.log('[ChatBasedVapiProvider] Step 2: Running multi-turn conversation with Vapi Chat API...');

      // Limitar nombre a 40 caracteres para Vapi API
      const chatName = test.name.length > 40
        ? test.name.substring(0, 37) + '...'
        : test.name;

      const conversation = await this.vapiClient.runMultiTurnConversation(
        test.vapi?.assistant_id || test.agent_id!,
        userMessages,
        { name: chatName }
      );
      console.log(`[ChatBasedVapiProvider] Conversation completed: ${conversation.chats.length} turns`);

      // 3. Evaluar criterios con Claude Code
      console.log('[ChatBasedVapiProvider] Step 3: Evaluating criteria with Claude Code...');
      const evaluations = await this.evaluateCriteria(
        conversation.fullConversation,
        test.evaluation_criteria || []
      );
      console.log(`[ChatBasedVapiProvider] Evaluated ${Object.keys(evaluations).length} criteria`);

      // 4. Construir resultado
      const executionTime = Date.now() - startTime;
      const allPassed = Object.values(evaluations).every(e => e.result === 'success');

      const result: TestResult = {
        test_name: test.name,
        agent_id: test.vapi?.assistant_id || test.agent_id,
        timestamp: new Date().toISOString(),
        success: allPassed,
        simulation_response: {
          simulated_conversation: this.convertToConversationTurns(conversation.fullConversation),
          analysis: {
            evaluation_criteria_results: evaluations,
            data_collection_results: {},
            call_success: allPassed,
            transcript_summary: this.generateTranscriptSummary(conversation.fullConversation),
          },
        },
        execution_time_ms: executionTime,
        vapi_cost: conversation.totalCost,
      };

      console.log(`[ChatBasedVapiProvider] Test completed in ${executionTime}ms`);
      console.log(`[ChatBasedVapiProvider] Result: ${allPassed ? 'PASS' : 'FAIL'} (${Object.values(evaluations).filter(e => e.result === 'success').length}/${Object.keys(evaluations).length} criteria passed)`);

      return result;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      console.error(`[ChatBasedVapiProvider] Test failed:`, error.message);

      return {
        test_name: test.name,
        agent_id: test.vapi?.assistant_id || test.agent_id,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        execution_time_ms: executionTime,
        simulation_response: {
          simulated_conversation: [],
          analysis: {
            evaluation_criteria_results: {},
            data_collection_results: {},
            call_success: false,
            transcript_summary: `Error: ${error.message}`,
          },
        },
      };
    }
  }

  /**
   * Genera mensajes de usuario simulado con Claude Code
   */
  private async generateUserMessages(test: TestDefinition): Promise<string[]> {
    if (!test.simulated_user) {
      throw new Error('Test must have simulated_user configuration for chat-based testing');
    }

    const { prompt, first_message, language } = test.simulated_user;

    // Preparar variables de contexto
    let variablesText = '';
    if (test.dynamic_variables && Object.keys(test.dynamic_variables).length > 0) {
      variablesText = 'The following variables are available for use:\n';
      for (const [key, value] of Object.entries(test.dynamic_variables)) {
        variablesText += `- {{${key}}}: ${value}\n`;
      }
    } else {
      variablesText = 'No specific variables defined.';
    }

    // Interpolar prompt de generación
    const generationPrompt = this.interpolateTemplate(this.conversationGeneratorPrompt, {
      USER_PROMPT: prompt,
      FIRST_MESSAGE: first_message,
      LANGUAGE: language || 'en',
      VARIABLES: variablesText,
    });

    // Ejecutar OpenAI
    const response = await this.llmClient.generateConversation(generationPrompt);

    // Parsear mensajes de usuario
    return this.parseUserMessages(response, first_message);
  }

  /**
   * Parsea la respuesta de OpenAI para extraer mensajes de usuario
   */
  private parseUserMessages(response: string, expectedFirstMessage: string): string[] {
    const messages: string[] = [];
    const lines = response.split('\n');

    // Patrones a ignorar (template headers y meta texto)
    const ignorePatterns = [
      /\*\*.*\*\*/,  // **Bold text**
      /behavioral\s+guidelines/i,
      /first\s+message/i,
      /context\s+variables/i,
      /user\s+profile/i,
      /language:/i,
      /output\s+requirements/i,
      /strict\s+format/i,
      /example/i,
      /generate/i,
      /user\s+message/i,
      /assistant/i,
      /instruction/i,
      /template/i,
      /required/i,
      /placeholder/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Ignorar líneas de markdown, headers, o metadata
      if (trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('-')) {
        continue;
      }

      // Buscar líneas numeradas: "1. mensaje" o "1) mensaje"
      const match = trimmed.match(/^(\d+)[\.)]\s*(.+)$/);
      if (match) {
        const messageText = match[2].trim();

        // Ignorar si coincide con algún patrón de template
        const shouldIgnore = ignorePatterns.some(pattern => pattern.test(messageText));

        if (!shouldIgnore) {
          messages.push(messageText);
        }
      }
    }

    // Validar que el primer mensaje coincida
    if (messages.length > 0 && messages[0] !== expectedFirstMessage) {
      console.warn(
        `[ChatBasedVapiProvider] First generated message doesn't match expected.\n` +
        `Expected: "${expectedFirstMessage}"\n` +
        `Got: "${messages[0]}"\n` +
        `Using expected message.`
      );
      messages[0] = expectedFirstMessage;
    }

    // Si no hay mensajes, usar solo el primer mensaje esperado
    if (messages.length === 0) {
      console.warn('[ChatBasedVapiProvider] No messages parsed from Claude Code, using only first_message');
      messages.push(expectedFirstMessage);
    }

    return messages;
  }

  /**
   * Evalúa criterios con OpenAI
   */
  private async evaluateCriteria(
    conversation: ChatMessage[],
    criteria: TestEvaluationCriterion[]
  ): Promise<Record<string, EvaluationResult>> {
    const results: Record<string, EvaluationResult> = {};

    if (criteria.length === 0) {
      return results;
    }

    // Convertir conversación a texto
    const conversationText = this.conversationToText(conversation);

    // Evaluar cada criterio
    for (const criterion of criteria) {
      const criterionPrompt = this.buildCriterionPrompt(criterion);

      try {
        const evaluation = await this.llmClient.evaluateCriterion(
          conversationText,
          criterionPrompt
        );

        results[criterion.id] = {
          criteria_id: criterion.id,
          result: evaluation.passed ? 'success' : 'failure',
          rationale: evaluation.reasoning,
        };

      } catch (error: any) {
        console.error(`[ChatBasedVapiProvider] Failed to evaluate criterion ${criterion.id}:`, error.message);
        results[criterion.id] = {
          criteria_id: criterion.id,
          result: 'failure',
          rationale: `Evaluation failed: ${error.message}`,
        };
      }
    }

    return results;
  }

  /**
   * Construye el prompt de evaluación para un criterio
   */
  private buildCriterionPrompt(criterion: TestEvaluationCriterion): string {
    const question = criterion.prompt || criterion.conversation_goal_prompt || criterion.name;

    return this.interpolateTemplate(this.criterionEvaluatorPrompt, {
      CRITERION_NAME: criterion.name,
      CRITERION_PROMPT: question,
    });
  }

  /**
   * Convierte conversación a texto plano
   */
  private conversationToText(conversation: ChatMessage[]): string {
    return conversation
      .map(msg => {
        const prefix = msg.role === 'user' ? 'USER' : 'ASSISTANT';
        return `${prefix}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Convierte ChatMessage[] a ConversationTurn[]
   */
  private convertToConversationTurns(conversation: ChatMessage[]): ConversationTurn[] {
    return conversation.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'agent',
      message: msg.content,
    }));
  }

  /**
   * Genera un resumen del transcript
   */
  private generateTranscriptSummary(conversation: ChatMessage[]): string {
    const userMessages = conversation.filter(m => m.role === 'user').length;
    const assistantMessages = conversation.filter(m => m.role === 'assistant').length;

    return `Conversation with ${userMessages} user messages and ${assistantMessages} assistant responses. ` +
      `Total turns: ${conversation.length}.`;
  }

  /**
   * Valida la configuración del test
   */
  protected validateTest(test: TestDefinition): void {
    if (!test.vapi?.assistant_id && !test.agent_id) {
      throw new Error('Test must have vapi.assistant_id or agent_id');
    }

    if (!test.simulated_user) {
      throw new Error('Test must have simulated_user for chat-based testing');
    }

    if (!test.simulated_user.prompt) {
      throw new Error('Test simulated_user must have prompt');
    }

    if (!test.simulated_user.first_message) {
      throw new Error('Test simulated_user must have first_message');
    }
  }

  /**
   * Verifica si el provider está configurado correctamente
   */
  isConfigured(): boolean {
    try {
      // Verificar que Vapi client está configurado
      const hasVapiKey = !!this.vapiClient;

      // Verificar que OpenAI está configurado
      const hasOpenAI = this.llmClient.isConfigured();

      return hasVapiKey && hasOpenAI;
    } catch (error) {
      return false;
    }
  }

  /**
   * Información sobre el provider
   */
  getInfo() {
    return {
      name: this.name,
      version: '1.0.0',
      capabilities: [
        'multi-turn-conversations',
        'chat-api',
        'openai-evaluation',
        'real-time-responses',
      ],
      llm: this.llmClient.getInfo(),
    };
  }
}
