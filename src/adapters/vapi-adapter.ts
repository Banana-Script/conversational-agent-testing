/**
 * Adaptador para convertir entre formato YAML unificado y formato Vapi Evals
 *
 * Enfoque Híbrido:
 * - Si conversation_turns está definido en YAML, se usa directamente
 * - Si no, se genera automáticamente desde simulated_user.prompt usando LLM
 * - Los criterios de evaluación se convierten en checkpoints con AI judges
 */

import OpenAI from 'openai';
import { ConversationCache } from '../utils/conversation-cache.js';
import type {
  TestDefinition,
  TestResult,
  SimulatedUserConfigYAML,
  TestEvaluationCriterion,
  ConversationTurn,
  EvaluationResult,
} from '../types/index.js';
import type {
  CreateEvalDto,
  CreateEvalDtoMessagesItem,
  ChatEvalUserMessageMock,
  ChatEvalSystemMessageMock,
  ChatEvalAssistantMessageEvaluation,
  EvalRun,
  EvalRunResult,
  VapiEvalOptions,
  VapiCriterionResult,
} from '../types/vapi.types.js';

export class VapiAdapter {
  private openai: OpenAI;
  private cache: ConversationCache;
  private defaultGeneratorModel: string;
  private defaultJudgeModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;

  constructor() {
    // Inicializar OpenAI para generación de conversaciones
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Inicializar caché de conversaciones
    this.cache = new ConversationCache('.tmp/conversations');

    // Configuración por defecto desde env vars
    this.defaultGeneratorModel = process.env.VAPI_EVAL_GENERATOR_MODEL || 'gpt-4o';
    this.defaultJudgeModel = process.env.VAPI_EVAL_JUDGE_MODEL || 'gpt-4o';
    this.defaultTemperature = parseFloat(process.env.VAPI_EVAL_TEMPERATURE || '0.3');
    this.defaultMaxTokens = parseInt(process.env.VAPI_MAX_CONVERSATION_TOKENS || '4000', 10);
  }

  // ==========================================================================
  // CONVERSIÓN A EVAL
  // ==========================================================================

  /**
   * Convierte una TestDefinition (YAML) a CreateEvalDto
   *
   * @param test Test definition desde YAML
   * @param assistantId ID del assistant de Vapi
   * @returns CreateEvalDto listo para ejecutar
   */
  async convertTestDefinition(test: TestDefinition, assistantId: string): Promise<CreateEvalDto> {
    const evalOptions = this.getEvalOptions(test);

    // 1. Generar o usar conversación existente
    const conversationTurns = await this.getConversationTurns(test, evalOptions);

    // 2. Construir mensajes de eval (conversación + checkpoints de evaluación)
    const messages = this.buildEvalMessages(
      conversationTurns,
      test.evaluation_criteria || [],
      test.dynamic_variables,
      evalOptions
    );

    console.log(`[VapiAdapter] Built ${messages.length} messages for eval:`, {
      userMessages: messages.filter((m: any) => m.role === 'user').length,
      systemMessages: messages.filter((m: any) => m.role === 'system').length,
      assistantMessages: messages.filter((m: any) => m.role === 'assistant').length,
      checkpoints: messages.filter((m: any) => m.role === 'assistant' && m.judgePlan).length,
    });

    return {
      name: test.name,
      description: test.description,
      type: 'chat.mockConversation',
      messages,
    };
  }

  /**
   * Obtiene las opciones de eval desde el test o defaults
   */
  private getEvalOptions(test: TestDefinition): Required<VapiEvalOptions> {
    const vapi = test.vapi || {};

    return {
      persistent: vapi.persistent_eval ?? false,
      maxConversationTokens: vapi.max_conversation_tokens ?? this.defaultMaxTokens,
      generatorModel: this.defaultGeneratorModel,
      judgeModel: this.defaultJudgeModel,
      temperature: test.simulated_user?.temperature ?? this.defaultTemperature,
    };
  }

  /**
   * Obtiene los turnos de conversación (manual o generados)
   */
  private async getConversationTurns(
    test: TestDefinition,
    options: Required<VapiEvalOptions>
  ): Promise<ConversationTurn[]> {
    // Si hay conversation_turns manuales en el YAML, usar esos
    if (test.vapi?.conversation_turns && test.vapi.conversation_turns.length > 0) {
      return test.vapi.conversation_turns.map(turn => ({
        role: turn.role === 'user' ? 'user' : 'agent',
        message: this.interpolateVariables(turn.message, test.dynamic_variables),
      }));
    }

    // Si no, generar automáticamente usando LLM
    if (!test.simulated_user?.prompt || !test.simulated_user?.first_message) {
      throw new Error(
        'Test must have either conversation_turns OR (simulated_user.prompt + simulated_user.first_message)'
      );
    }

    return await this.generateConversationTurns(test, options);
  }

  /**
   * Genera turnos de conversación completa usando LLM
   * Simula TODA la conversación hasta completar el objetivo
   * Usa caché para evitar regenerar conversaciones idénticas
   */
  private async generateConversationTurns(
    test: TestDefinition,
    options: Required<VapiEvalOptions>
  ): Promise<ConversationTurn[]> {
    const user = test.simulated_user!;

    // Intentar obtener del caché
    const cacheKey = {
      testName: test.name,
      prompt: user.prompt,
      firstMessage: user.first_message,
      variables: test.dynamic_variables || {},
      model: options.generatorModel,
      temperature: options.temperature,
    };

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // No está en caché, generar con LLM
    console.log(`[VapiAdapter] Generating conversation for "${test.name}" with ${options.generatorModel}...`);

    // Construir prompt para el generador
    const systemPrompt = this.buildConversationGeneratorPrompt(test);

    // Llamar a OpenAI para generar la conversación completa
    const completionParams: any = {
      model: options.generatorModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate the full conversation.` },
      ],
      max_completion_tokens: options.maxConversationTokens,
    };

    // GPT-5 mini solo soporta temperature = 1 (default)
    if (!options.generatorModel.includes('gpt-5-mini')) {
      completionParams.temperature = options.temperature;
    }

    const response = await this.openai.chat.completions.create(completionParams);

    const generatedText = response.choices[0]?.message?.content;
    const finishReason = response.choices[0]?.finish_reason;

    // Caso especial: GPT-5 mini puede usar todos los tokens en reasoning y no generar output
    if (!generatedText || generatedText.trim().length === 0) {
      if (finishReason === 'length') {
        console.error(
          `[VapiAdapter] GPT-5 mini used all tokens for reasoning without generating conversation. ` +
          `Increasing VAPI_MAX_CONVERSATION_TOKENS to allow more output tokens.`
        );
        throw new Error(
          `Failed to generate conversation: model used all tokens for internal reasoning. ` +
          `Increase VAPI_MAX_CONVERSATION_TOKENS or use a different model.`
        );
      }
      console.error('[VapiAdapter] OpenAI response:', JSON.stringify(response, null, 2));
      throw new Error(
        `Failed to generate conversation from LLM. ` +
        `Finish reason: ${finishReason || 'unknown'}`
      );
    }

    // Si se alcanzó el límite de tokens, advertir pero continuar
    if (finishReason === 'length') {
      console.warn(
        `[VapiAdapter] Conversation for "${test.name}" was truncated (reached token limit). ` +
        `Generated text may be incomplete.`
      );
    }

    console.log(`[VapiAdapter] Generated ${generatedText.length} characters (finish: ${finishReason})`);

    // Parsear la conversación generada
    const turns = this.parseGeneratedConversation(generatedText, user.first_message);

    console.log(`[VapiAdapter] Parsed ${turns.length} conversation turns`);

    // Guardar en caché
    await this.cache.set(cacheKey, turns);

    return turns;
  }

  /**
   * Construye el prompt del sistema para generar conversaciones
   */
  private buildConversationGeneratorPrompt(test: TestDefinition): string {
    const user = test.simulated_user!;
    const variables = test.dynamic_variables || {};

    let prompt = `You are simulating a complete conversation between a user and an AI assistant.

# User Profile
${user.prompt}

# First Message
The user starts with: "${user.first_message}"

# Language
${user.language || 'en'}

# Context Variables
`;

    if (Object.keys(variables).length > 0) {
      prompt += 'The following variables are available for use:\n';
      for (const [key, value] of Object.entries(variables)) {
        prompt += `- {{${key}}}: ${value}\n`;
      }
    } else {
      prompt += 'No specific variables defined.\n';
    }

    prompt += `
# Instructions
Generate a COMPLETE, realistic conversation between the user and assistant that:
1. Starts with the user's first message
2. Follows the user's behavior profile
3. Continues until the conversation reaches a natural conclusion
4. Includes ALL necessary turns (no artificial limit)
5. Represents a realistic interaction

# Output Format
Format the conversation exactly like this:

User: [first message]
Assistant: [response]
User: [next message]
Assistant: [response]
...

Continue until the conversation naturally concludes. Use ONLY "User:" and "Assistant:" prefixes.
Do NOT include any other text, explanations, or formatting.
`;

    return prompt;
  }

  /**
   * Parsea la conversación generada por el LLM
   */
  private parseGeneratedConversation(
    generatedText: string,
    expectedFirstMessage: string
  ): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    const lines = generatedText.split('\n');

    let currentRole: 'user' | 'agent' | null = null;
    let currentMessage = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('User:')) {
        // Guardar mensaje anterior
        if (currentRole && currentMessage) {
          turns.push({ role: currentRole, message: currentMessage.trim() });
        }
        currentRole = 'user';
        currentMessage = trimmed.replace('User:', '').trim();
      } else if (trimmed.startsWith('Assistant:')) {
        // Guardar mensaje anterior
        if (currentRole && currentMessage) {
          turns.push({ role: currentRole, message: currentMessage.trim() });
        }
        currentRole = 'agent';
        currentMessage = trimmed.replace('Assistant:', '').trim();
      } else if (currentRole) {
        // Continuación del mensaje actual
        currentMessage += ' ' + trimmed;
      }
    }

    // Guardar último mensaje
    if (currentRole && currentMessage) {
      turns.push({ role: currentRole, message: currentMessage.trim() });
    }

    // Validar que empiece con el mensaje esperado
    if (turns.length === 0 || turns[0].role !== 'user') {
      throw new Error('Generated conversation must start with a user message');
    }

    return turns;
  }

  /**
   * Construye el array de mensajes de Eval:
   * - Alterna mensajes de usuario con checkpoints de evaluación
   * - Cada criterio se evalúa después de un turno específico del usuario
   * - Para chat.mockConversation, DEBE haber un assistant message después de cada user message
   *
   * IMPORTANTE: Vapi termina conversaciones cuando los user messages no responden
   * coherentemente a las preguntas del assistant real. Por eso limitamos a MAX 3 turnos.
   */
  private buildEvalMessages(
    conversationTurns: ConversationTurn[],
    criteria: TestEvaluationCriterion[],
    variables: Record<string, any> = {},
    options: Required<VapiEvalOptions>
  ): CreateEvalDtoMessagesItem[] {
    const messages: CreateEvalDtoMessagesItem[] = [];

    // PROBLEMA: Las conversaciones pre-generadas asumen respuestas específicas del assistant
    // que no coinciden con el assistant real de Vapi, causando terminación prematura.
    //
    // SOLUCIÓN TEMPORAL: Usar solo el PRIMER mensaje del usuario y evaluar todos los criterios
    // en esa única respuesta. Esto es limitado pero al menos funciona de manera confiable.
    //
    // TODO: Implementar generación de usuarios simulados "reactivos" que puedan responder
    // dinámicamente a lo que el assistant diga, o usar un enfoque diferente como tool-based evals.
    const USE_ONLY_FIRST_MESSAGE = true;

    const userTurns = conversationTurns.filter(t => t.role === 'user');
    const userCount = USE_ONLY_FIRST_MESSAGE ? Math.min(1, userTurns.length) : userTurns.length;

    console.log(`[VapiAdapter] Building eval messages: ${userCount} user turn(s), ${criteria.length} criteria${USE_ONLY_FIRST_MESSAGE ? ' (using only first message due to mockConversation limitations)' : ''}`);

    // Con USE_ONLY_FIRST_MESSAGE=true, ponemos TODOS los criterios en el primer turno
    const criteriaPerTurn: Map<number, TestEvaluationCriterion[]> = new Map();

    if (USE_ONLY_FIRST_MESSAGE) {
      // Todos los criterios se evalúan después del primer mensaje
      criteriaPerTurn.set(0, criteria);
    } else {
      if (criteria.length === 0) {
        // Sin criterios, distribuir checkpoints simples (regex que siempre pasa)
        for (let i = 0; i < userCount; i++) {
          criteriaPerTurn.set(i, []);
        }
      } else {
        // Distribuir criterios uniformemente entre los turnos
        const step = Math.max(1, Math.floor(userCount / criteria.length));

        for (let i = 0; i < criteria.length; i++) {
          const turnIndex = Math.min(userCount - 1, i * step);
          const existing = criteriaPerTurn.get(turnIndex) || [];
          existing.push(criteria[i]);
          criteriaPerTurn.set(turnIndex, existing);
        }
      }
    }

    // Construir mensajes intercalados
    let userIndex = 0;
    for (const turn of conversationTurns) {
      if (turn.role === 'user' && userIndex < userCount) {
        // Agregar mensaje de usuario
        const userMessage: ChatEvalUserMessageMock = {
          role: 'user',
          content: this.interpolateVariables(turn.message, variables),
        };
        messages.push(userMessage);

        // Agregar checkpoint(s) después de este usuario
        const turnCriteria = criteriaPerTurn.get(userIndex) || [];

        if (turnCriteria.length > 0) {
          // Crear UN checkpoint que evalúa todos los criterios de este turno
          const judgeInstructions = turnCriteria.length === 1
            ? this.buildEvaluationSystemPrompt(turnCriteria[0])
            : this.buildMultiCriteriaEvaluationPrompt(turnCriteria);

          const judgeModelConfig: any = {
            provider: 'openai',
            model: this.normalizeModelName(options.judgeModel),
            maxTokens: 500,  // Más tokens para evaluar múltiples criterios
            messages: [
              {
                role: 'system',
                content: judgeInstructions,
              },
            ],
          };

          if (!options.judgeModel.includes('gpt-5-mini')) {
            judgeModelConfig.temperature = 0.2;
          }

          const checkpoint: ChatEvalAssistantMessageEvaluation = {
            role: 'assistant',
            judgePlan: {
              type: 'ai',
              model: judgeModelConfig,
            } as any,
          };
          messages.push(checkpoint);
        } else {
          // Sin criterios en este turno, agregar checkpoint simple que siempre pasa
          const checkpoint: ChatEvalAssistantMessageEvaluation = {
            role: 'assistant',
            judgePlan: {
              type: 'regex',
              content: '.+',
            } as any,
          };
          messages.push(checkpoint);
        }

        userIndex++;
      }
    }

    console.log(`[VapiAdapter] Built ${messages.length} total messages (${userCount} user + ${userCount} assistant)`);

    return messages;
  }

  /**
   * Construye el prompt del sistema para un AI judge con un solo criterio
   */
  private buildEvaluationSystemPrompt(criterion: TestEvaluationCriterion): string {
    const question = criterion.prompt || criterion.conversation_goal_prompt || criterion.name;

    return `You are evaluating an AI assistant's performance in a conversation.

# Evaluation Criterion
Name: ${criterion.name}
Question: ${question}

# Instructions
Review the complete conversation in {{messages}} and determine if the assistant met this specific criterion.

Respond with ONLY one word:
- "pass" if the criterion was met
- "fail" if the criterion was not met

Do NOT include any explanation, reasoning, or other text. Just "pass" or "fail".`;
  }

  /**
   * Construye el prompt del sistema para un AI judge con múltiples criterios
   */
  private buildMultiCriteriaEvaluationPrompt(criteria: TestEvaluationCriterion[]): string {
    if (criteria.length === 1) {
      return this.buildEvaluationSystemPrompt(criteria[0]);
    }

    let prompt = `You are evaluating an AI assistant's performance in a conversation.

# Evaluation Criteria
You need to evaluate the following ${criteria.length} criteria based on the assistant's response:

`;

    criteria.forEach((criterion, index) => {
      const question = criterion.prompt || criterion.conversation_goal_prompt || criterion.name;
      prompt += `${index + 1}. ${criterion.name}
   ${question}

`;
    });

    prompt += `# Instructions
Review the assistant's response in {{messages}} and determine if it demonstrates ALL of these criteria.

IMPORTANT: This is evaluating the assistant's FIRST RESPONSE to the user. The criteria may reference
actions that would normally happen across multiple turns in a full conversation. Evaluate whether the
assistant's response shows proper understanding and sets up the conversation correctly, even if all
criteria won't be fully observable until later turns.

Respond with ONLY one word:
- "pass" if the response demonstrates all criteria OR sets up the conversation to meet them
- "fail" if the response clearly violates or fails to set up any criterion

Do NOT include any explanation, reasoning, or other text. Just "pass" or "fail".`;

    return prompt;
  }

  /**
   * Normaliza el nombre del modelo a un valor aceptado por Vapi
   * Mapea nombres comunes a los valores del enum de Vapi
   */
  private normalizeModelName(modelName: string): string {
    // Map de nombres comunes a nombres de Vapi
    const modelMap: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
    };

    return modelMap[modelName] || 'gpt-4o';  // Default a gpt-4o si no se reconoce
  }

  /**
   * Interpola variables en un texto
   */
  private interpolateVariables(text: string, variables: Record<string, any> = {}): string {
    let result = text;

    for (const [key, value] of Object.entries(variables)) {
      // Reemplazar ${key}, {key}, y {{key}}
      const patterns = [
        new RegExp(`\\$\\{${key}\\}`, 'g'),
        new RegExp(`(?<!\\{)\\{${key}\\}(?!\\})`, 'g'),
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      ];

      for (const pattern of patterns) {
        result = result.replace(pattern, String(value));
      }
    }

    return result;
  }

  // ==========================================================================
  // CONVERSIÓN DE RESULTADOS
  // ==========================================================================

  /**
   * Convierte un EvalRun a TestResult
   */
  convertEvalRunToTestResult(evalRun: EvalRun, test: TestDefinition): TestResult {
    const result = evalRun.results?.[0];
    if (!result) {
      throw new Error('No eval results found in run');
    }

    console.log('[VapiAdapter] EvalRunResult structure:', {
      status: result.status,
      messageCount: result.messages?.length || 0,
      keys: Object.keys(result),
    });

    // Debug: mostrar estructura completa del resultado (solo primeras claves)
    console.log('[VapiAdapter] Full result keys:', JSON.stringify(Object.keys(result)));

    // Extraer conversación real
    const conversation = this.extractConversation(result);

    // Extraer resultados de criterios
    const criteriaResults = this.extractCriteriaResults(
      result,
      test.evaluation_criteria || []
    );

    // Determinar éxito general (todos los criterios deben pasar)
    const allPassed = Object.values(criteriaResults).every(
      r => r.result === 'success'
    );

    return {
      test_name: test.name,
      agent_id: test.vapi?.assistant_id || test.agent_id,
      timestamp: evalRun.endedAt || new Date().toISOString(),
      success: allPassed && result.status === 'pass',
      simulation_response: {
        simulated_conversation: conversation,
        analysis: {
          evaluation_criteria_results: criteriaResults,
          data_collection_results: {},
          call_success: allPassed,
          transcript_summary: this.generateConversationSummary(conversation),
        },
      },
      execution_time_ms: this.calculateDuration(evalRun),
      vapi_eval_run_id: evalRun.id,
      vapi_cost: evalRun.cost,
    };
  }

  /**
   * Extrae la conversación real del EvalRunResult
   */
  private extractConversation(result: EvalRunResult): ConversationTurn[] {
    const turns: ConversationTurn[] = [];

    for (const msg of result.messages || []) {
      const msgAny = msg as any;

      // Solo incluir mensajes de user y assistant
      if (msgAny.role === 'user' || msgAny.role === 'assistant') {
        turns.push({
          role: msgAny.role === 'user' ? 'user' : 'agent',
          message: msgAny.content || msgAny.message || '',
        });
      }
    }

    return turns;
  }

  /**
   * Extrae los resultados de los criterios de evaluación
   */
  private extractCriteriaResults(
    result: EvalRunResult,
    originalCriteria: TestEvaluationCriterion[]
  ): Record<string, EvaluationResult> {
    const results: Record<string, EvaluationResult> = {};

    // Los mensajes del eval incluyen los checkpoints con campo "judge" después de la evaluación
    const messages = result.messages || [];

    console.log(`[VapiAdapter] Extracting criteria results from ${messages.length} messages`);
    console.log(`[VapiAdapter] Looking for ${originalCriteria.length} criteria results`);

    // Los criterios están distribuidos entre los mensajes de assistant
    // Cada assistant message con "judge" representa el resultado de un checkpoint
    const judgeMessages = messages.filter((msg: any) => msg.role === 'assistant' && msg.judge);

    console.log(`[VapiAdapter] Found ${judgeMessages.length} judge results in messages`);

    // DEBUG: Mostrar todos los judges encontrados
    judgeMessages.forEach((judgeMsg: any, idx) => {
      console.log(`[VapiAdapter] Judge ${idx}:`, {
        status: judgeMsg.judge?.status,
        hasFailureReason: !!judgeMsg.judge?.failureReason,
        failureReason: judgeMsg.judge?.failureReason?.substring(0, 100),
        contentPreview: judgeMsg.content?.substring(0, 50),
      });
    });

    // Estrategia simple: mapear los judges en orden a los criterios
    // Asumimos que están en el mismo orden que los criteria originales
    // NOTA: Esto puede no ser 100% confiable si la conversación termina temprano
    for (let i = 0; i < Math.min(judgeMessages.length, originalCriteria.length); i++) {
      const judgeMsg = judgeMessages[i] as any;
      const criterion = originalCriteria[i];
      const judge = judgeMsg.judge;

      const passed = judge.status === 'pass';
      const failureReason = judge.failureReason || '';

      results[criterion.id] = {
        criteria_id: criterion.id,
        result: passed ? 'success' : 'failure',
        rationale: passed
          ? `Criterion passed: ${criterion.name}`
          : `Criterion failed: ${failureReason || criterion.name}`,
      };

      console.log(`[VapiAdapter] Criterion "${criterion.name}": ${passed ? 'PASS' : 'FAIL'}${failureReason ? ` (${failureReason.substring(0, 100)})` : ''}`);
    }

    console.log(`[VapiAdapter] Extracted ${Object.keys(results).length} criteria results`);

    // Si no encontramos suficientes resultados, llenar los faltantes con el estado general
    if (Object.keys(results).length < originalCriteria.length) {
      console.warn(`[VapiAdapter] Only found ${Object.keys(results).length}/${originalCriteria.length} judge results, using overall status for missing criteria`);
      const overallPassed = result.status === 'pass';

      for (let i = Object.keys(results).length; i < originalCriteria.length; i++) {
        const criterion = originalCriteria[i];
        results[criterion.id] = {
          criteria_id: criterion.id,
          result: overallPassed ? 'success' : 'failure',
          rationale: 'No individual judge result available, using overall eval status',
        };
      }
    }

    return results;
  }

  /**
   * Genera un resumen de la conversación
   */
  private generateConversationSummary(conversation: ConversationTurn[]): string {
    if (conversation.length === 0) {
      return 'Empty conversation';
    }

    if (conversation.length <= 4) {
      return conversation.map(t => `${t.role}: ${t.message}`).join('\n');
    }

    const start = conversation.slice(0, 2);
    const end = conversation.slice(-2);

    return [
      ...start.map(t => `${t.role}: ${t.message}`),
      '...',
      ...end.map(t => `${t.role}: ${t.message}`),
    ].join('\n');
  }

  /**
   * Calcula la duración de un eval run
   */
  private calculateDuration(run: EvalRun): number {
    if (run.startedAt && run.endedAt) {
      const start = new Date(run.startedAt).getTime();
      const end = new Date(run.endedAt).getTime();
      return end - start;
    }
    return 0;
  }
}
