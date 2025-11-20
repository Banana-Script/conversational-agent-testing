/**
 * Cliente para OpenAI API
 * Usado por ChatBasedVapiProvider para:
 * - Generar conversaciones de usuario simulado (con VAPI_EVAL_GENERATOR_MODEL)
 * - Evaluar criterios contra conversaciones (con VAPI_EVAL_JUDGE_MODEL)
 */

import OpenAI from 'openai';

export interface OpenAIClientOptions {
  apiKey?: string;
  generatorModel?: string;
  judgeModel?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
}

export interface EvaluationResult {
  passed: boolean;
  reasoning: string;
}

export class OpenAIClient {
  private openai: OpenAI;
  private generatorModel: string;
  private judgeModel: string;
  private temperature: number;
  private maxTokens: number;
  private verbose: boolean;

  constructor(options: OpenAIClientOptions = {}) {
    this.openai = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    });

    this.generatorModel = options.generatorModel ||
                          process.env.VAPI_EVAL_GENERATOR_MODEL ||
                          'gpt-4o';
    this.judgeModel = options.judgeModel ||
                      process.env.VAPI_EVAL_JUDGE_MODEL ||
                      'gpt-4o';
    this.temperature = options.temperature ??
                       parseFloat(process.env.VAPI_EVAL_TEMPERATURE || '0.3');
    this.maxTokens = options.maxTokens ??
                     parseInt(process.env.VAPI_MAX_CONVERSATION_TOKENS || '4000', 10);
    this.verbose = options.verbose ?? false;

    if (this.verbose) {
      console.log('[OpenAIClient] Initialized with config:', {
        generatorModel: this.generatorModel,
        judgeModel: this.judgeModel,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });
    }
  }

  /**
   * Genera mensajes de usuario simulado usando OpenAI
   *
   * @param prompt Prompt para generar mensajes de usuario
   * @returns String con mensajes numerados (1. mensaje\n2. mensaje\n...)
   */
  async generateConversation(prompt: string): Promise<string> {
    if (this.verbose) {
      console.log('[OpenAIClient] Generating conversation with model:', this.generatorModel);
      console.log('[OpenAIClient] Prompt length:', prompt.length, 'chars');
    }

    try {
      const completionParams: any = {
        model: this.generatorModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      // gpt-5 models only support temperature 1 (default)
      if (!this.generatorModel.includes('gpt-5')) {
        completionParams.temperature = this.temperature;
      }

      // gpt-4o and newer models use max_completion_tokens
      // older models use max_tokens
      if (this.generatorModel.includes('gpt-5') || this.generatorModel.includes('gpt-4o')) {
        completionParams.max_completion_tokens = this.maxTokens;
      } else {
        completionParams.max_tokens = this.maxTokens;
      }

      const completion = await this.openai.chat.completions.create(completionParams);

      const response = completion.choices[0]?.message?.content || '';

      if (this.verbose) {
        console.log('[OpenAIClient] Generated response length:', response.length, 'chars');
      }

      return response;

    } catch (error: any) {
      console.error('[OpenAIClient] Failed to generate conversation:', error.message);
      throw error;
    }
  }

  /**
   * Evalúa un criterio contra una conversación usando OpenAI
   *
   * @param conversationText Conversación completa en formato texto
   * @param evaluationPrompt Prompt para evaluar el criterio
   * @returns EvaluationResult con passed y reasoning
   */
  async evaluateCriterion(
    conversationText: string,
    evaluationPrompt: string
  ): Promise<EvaluationResult> {
    if (this.verbose) {
      console.log('[OpenAIClient] Evaluating criterion with model:', this.judgeModel);
    }

    try {
      // Combinar prompt de evaluación con conversación
      const fullPrompt = `${evaluationPrompt}\n\n${conversationText}`;

      const evaluationParams: any = {
        model: this.judgeModel,
        messages: [
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
      };

      // gpt-5 models only support temperature 1 (default)
      if (!this.judgeModel.includes('gpt-5')) {
        evaluationParams.temperature = 0.0; // Temperatura baja para evaluaciones consistentes
      }

      // gpt-4o and newer models use max_completion_tokens
      // older models use max_tokens
      if (this.judgeModel.includes('gpt-5') || this.judgeModel.includes('gpt-4o')) {
        evaluationParams.max_completion_tokens = 500; // Las evaluaciones son cortas
      } else {
        evaluationParams.max_tokens = 500;
      }

      const completion = await this.openai.chat.completions.create(evaluationParams);

      const response = completion.choices[0]?.message?.content || '';

      // Parsear resultado
      // Esperamos formato: RESULT: pass|fail\nREASONING: ...
      const resultMatch = response.match(/RESULT:\s*(pass|fail)/i);
      const reasoningMatch = response.match(/REASONING:\s*(.+)/is);

      if (!resultMatch) {
        console.warn('[OpenAIClient] Could not parse evaluation result from:', response.substring(0, 200));
        return {
          passed: false,
          reasoning: 'Failed to parse evaluation result from OpenAI',
        };
      }

      const passed = resultMatch[1].toLowerCase() === 'pass';
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';

      if (this.verbose) {
        console.log('[OpenAIClient] Evaluation result:', passed ? 'PASS' : 'FAIL');
        console.log('[OpenAIClient] Reasoning:', reasoning.substring(0, 100) + '...');
      }

      return { passed, reasoning };

    } catch (error: any) {
      console.error('[OpenAIClient] Failed to evaluate criterion:', error.message);
      throw error;
    }
  }

  /**
   * Evalúa múltiples criterios en paralelo
   *
   * @param conversationText Conversación completa
   * @param evaluationPrompts Array de {id, prompt} para cada criterio
   * @returns Record<string, EvaluationResult>
   */
  async evaluateMultipleCriteria(
    conversationText: string,
    evaluationPrompts: { id: string; prompt: string }[]
  ): Promise<Record<string, EvaluationResult>> {
    if (this.verbose) {
      console.log(`[OpenAIClient] Evaluating ${evaluationPrompts.length} criteria in parallel...`);
    }

    // Evaluar todos los criterios en paralelo
    const results = await Promise.all(
      evaluationPrompts.map(async ({ id, prompt }) => {
        try {
          const result = await this.evaluateCriterion(conversationText, prompt);
          return { id, result };
        } catch (error: any) {
          console.error(`[OpenAIClient] Failed to evaluate criterion ${id}:`, error.message);
          return {
            id,
            result: {
              passed: false,
              reasoning: `Evaluation failed: ${error.message}`,
            },
          };
        }
      })
    );

    // Convertir array a record
    const evaluationResults: Record<string, EvaluationResult> = {};
    for (const { id, result } of results) {
      evaluationResults[id] = result;
    }

    return evaluationResults;
  }

  /**
   * Verifica si el cliente está configurado correctamente
   */
  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Obtiene información del cliente
   */
  getInfo(): string {
    return `OpenAI API (generator: ${this.generatorModel}, judge: ${this.judgeModel})`;
  }
}
