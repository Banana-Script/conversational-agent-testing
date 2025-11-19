/**
 * Adaptador para convertir entre formato YAML unificado y formato Vapi
 */

import type {
  TestDefinition,
  TestResult,
  SimulatedUserConfigYAML,
  TestEvaluationCriterion,
  ConversationTurn,
  EvaluationResult,
} from '../types/index.js';
import type {
  VapiTestConfig,
  VapiTestRun,
  VapiRubricResult,
  VapiTestAttempt,
} from '../types/vapi.types.js';

export class VapiAdapter {
  /**
   * Convierte una TestDefinition (YAML) a VapiTestConfig
   */
  convertTestDefinition(test: TestDefinition, assistantId: string): VapiTestConfig {
    return {
      type: 'chat',  // Por ahora solo chat, voice se agregará después
      assistant: test.vapi?.assistant_id || assistantId,
      script: this.buildScript(test.simulated_user, test.dynamic_variables),
      evaluationPlan: {
        rubric: this.buildRubric(test.evaluation_criteria),
      },
      attempts: test.vapi?.attempts || 1,
      name: test.name,
      description: test.description,
      variableValues: test.dynamic_variables,
    };
  }

  /**
   * Construye el script libre para Vapi desde configuración estructurada
   */
  private buildScript(
    user: SimulatedUserConfigYAML,
    variables?: Record<string, any>
  ): string {
    let script = `# Simulated User Test Script\n\n`;

    // Configuración de idioma
    script += `## Language\n${user.language}\n\n`;

    // Mensaje inicial
    script += `## Initial Message\n`;
    script += `Start the conversation with: "${user.first_message}"\n\n`;

    // Comportamiento principal
    script += `## Behavior\n`;
    script += `${user.prompt}\n\n`;

    // Variables de contexto (si hay)
    if (variables && Object.keys(variables).length > 0) {
      script += `## Available Context Variables\n`;
      script += `You have access to these variables in the conversation:\n`;
      for (const [key, value] of Object.entries(variables)) {
        script += `- {{${key}}}: ${value}\n`;
      }
      script += `\n`;
    }

    // Guidelines
    script += `## Guidelines\n`;
    script += `- Respond naturally and conversationally\n`;
    script += `- Follow the behavior patterns described above\n`;
    script += `- Stay in character throughout the interaction\n`;
    script += `- Keep responses concise but realistic\n`;

    // Temperatura (creatividad)
    if (user.temperature !== undefined) {
      const creativity = this.getCreativityLevel(user.temperature);
      script += `- Response style: ${creativity}\n`;
    }

    // LLM específico (si se especificó)
    if (user.llm) {
      script += `- Preferred behavior model: ${user.llm}\n`;
    }

    return script.trim();
  }

  /**
   * Determina el nivel de creatividad basado en temperatura
   */
  private getCreativityLevel(temperature: number): string {
    if (temperature < 0.3) {
      return 'precise and consistent (low creativity)';
    } else if (temperature > 0.7) {
      return 'varied and creative (high creativity)';
    } else {
      return 'balanced (moderate creativity)';
    }
  }

  /**
   * Construye el rubric (preguntas de evaluación) desde criterios
   */
  private buildRubric(criteria?: TestEvaluationCriterion[]): string[] {
    if (!criteria || criteria.length === 0) {
      // Criterio por defecto si no se especifica ninguno
      return ['Did the agent respond appropriately to the user throughout the conversation?'];
    }

    return criteria.map(c => {
      // Usar el campo prompt o conversation_goal_prompt
      const question = c.prompt || c.conversation_goal_prompt || c.name;
      return this.ensureQuestion(question);
    });
  }

  /**
   * Asegura que el texto sea una pregunta
   * Convierte statements a preguntas si es necesario
   */
  private ensureQuestion(text: string): string {
    // Si ya es una pregunta, retornar tal cual
    if (text.includes('?')) {
      return text;
    }

    // Convertir statements comunes a preguntas
    const lowerText = text.toLowerCase();

    if (lowerText.startsWith('evalua') || lowerText.startsWith('evaluate')) {
      // "Evalúa si X" → "Did X?"
      return text.replace(/^evalua(r|te)?/i, 'Did') + '?';
    }

    if (lowerText.startsWith('verifica') || lowerText.startsWith('verify')) {
      // "Verifica que X" → "Did X?"
      return text.replace(/^verifica(r|te)?/i, 'Did') + '?';
    }

    if (lowerText.includes('should') || lowerText.includes('debe')) {
      // "Agent should X" → "Did the agent X?"
      return `Did the test satisfy: ${text}?`;
    }

    // Por defecto, envolver en pregunta genérica
    return `Did the conversation meet this criterion: ${text}?`;
  }

  /**
   * Convierte resultados de Vapi a formato unificado TestResult
   */
  convertResults(vapiRun: VapiTestRun, test: TestDefinition): TestResult {
    // Tomar el primer test del run (asumimos un test por ejecución)
    const vapiTest = vapiRun.tests[0];
    if (!vapiTest) {
      throw new Error('No test results found in Vapi run');
    }

    // Tomar el primer intento (o podríamos agregar lógica para mejor intento)
    const attempt = vapiTest.attempts[0];
    if (!attempt) {
      throw new Error('No test attempts found');
    }

    // Determinar éxito general
    const success = attempt.status === 'passed';

    return {
      test_name: test.name,
      agent_id: test.vapi?.assistant_id || test.agent_id,
      timestamp: vapiRun.completedAt || new Date().toISOString(),
      success,
      simulation_response: {
        simulated_conversation: this.parseTranscript(attempt.transcript),
        analysis: {
          evaluation_criteria_results: this.convertEvaluationResults(
            attempt.evaluationResults.rubric,
            test.evaluation_criteria
          ),
          data_collection_results: {},
          call_success: success,
          transcript_summary: this.generateSummary(attempt.transcript),
        },
      },
      execution_time_ms: attempt.duration || 0,
    };
  }

  /**
   * Parsea el transcript de Vapi a formato de turnos
   */
  private parseTranscript(transcript: string): ConversationTurn[] {
    const turns: ConversationTurn[] = [];

    // Vapi devuelve transcript como texto plano
    // Formato típico: "User: ...\nAgent: ...\nUser: ..."
    const lines = transcript.split('\n');

    let currentRole: 'user' | 'agent' = 'user';
    let currentMessage = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (trimmedLine.startsWith('User:')) {
        // Guardar mensaje anterior si existe
        if (currentMessage) {
          turns.push({ role: currentRole, message: currentMessage.trim() });
        }
        currentRole = 'user';
        currentMessage = trimmedLine.replace('User:', '').trim();
      } else if (trimmedLine.startsWith('Agent:') || trimmedLine.startsWith('Assistant:')) {
        // Guardar mensaje anterior si existe
        if (currentMessage) {
          turns.push({ role: currentRole, message: currentMessage.trim() });
        }
        currentRole = 'agent';
        currentMessage = trimmedLine.replace(/^(Agent|Assistant):/, '').trim();
      } else {
        // Continuación del mensaje actual
        currentMessage += ' ' + trimmedLine;
      }
    }

    // Guardar último mensaje
    if (currentMessage) {
      turns.push({ role: currentRole, message: currentMessage.trim() });
    }

    return turns;
  }

  /**
   * Convierte resultados de rubric de Vapi a formato de evaluación unificado
   */
  private convertEvaluationResults(
    rubricResults: VapiRubricResult[],
    originalCriteria?: TestEvaluationCriterion[]
  ): Record<string, EvaluationResult> {
    const results: Record<string, EvaluationResult> = {};

    rubricResults.forEach((rubric, index) => {
      // Intentar mapear de vuelta al criterio original por índice
      const criterionId = originalCriteria?.[index]?.id || `vapi-criterion-${index}`;

      results[criterionId] = {
        criteria_id: criterionId,
        result: rubric.passed ? 'success' : 'failure',
        rationale: rubric.reasoning,
      };
    });

    return results;
  }

  /**
   * Genera un resumen del transcript
   */
  private generateSummary(transcript: string): string {
    // Tomar primeras y últimas líneas como resumen
    const lines = transcript.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      return 'Empty conversation';
    }

    if (lines.length <= 4) {
      return transcript;
    }

    // Primeras 2 y últimas 2 líneas
    const start = lines.slice(0, 2).join('\n');
    const end = lines.slice(-2).join('\n');

    return `${start}\n...\n${end}`;
  }

  /**
   * Normaliza referencias a variables en el texto
   * Convierte ${VAR} o {VAR} al formato de Vapi {{VAR}}
   */
  normalizeVariableReferences(text: string): string {
    // ${VAR} → {{VAR}}
    let normalized = text.replace(/\$\{(\w+)\}/g, '{{$1}}');

    // {VAR} → {{VAR}} (solo si no es ya {{VAR}})
    normalized = normalized.replace(/(?<!\{)\{(\w+)\}(?!\})/g, '{{$1}}');

    return normalized;
  }

  /**
   * Convierte múltiples intentos a un resultado agregado
   * Útil cuando attempts > 1
   */
  convertMultipleAttempts(
    vapiTest: { attempts: VapiTestAttempt[] },
    test: TestDefinition
  ): {
    bestAttempt: VapiTestAttempt;
    worstAttempt: VapiTestAttempt;
    passRate: number;
    averageDuration: number;
  } {
    const attempts = vapiTest.attempts;

    if (attempts.length === 0) {
      throw new Error('No attempts found');
    }

    // Calcular pass rate
    const passedCount = attempts.filter(a => a.status === 'passed').length;
    const passRate = passedCount / attempts.length;

    // Mejor intento (passed con más rubrics pasados)
    const bestAttempt = attempts.reduce((best, current) => {
      const currentPassed = current.evaluationResults.rubric.filter(r => r.passed).length;
      const bestPassed = best.evaluationResults.rubric.filter(r => r.passed).length;
      return currentPassed > bestPassed ? current : best;
    });

    // Peor intento
    const worstAttempt = attempts.reduce((worst, current) => {
      const currentPassed = current.evaluationResults.rubric.filter(r => r.passed).length;
      const worstPassed = worst.evaluationResults.rubric.filter(r => r.passed).length;
      return currentPassed < worstPassed ? current : worst;
    });

    // Duración promedio
    const totalDuration = attempts.reduce((sum, a) => sum + (a.duration || 0), 0);
    const averageDuration = totalDuration / attempts.length;

    return {
      bestAttempt,
      worstAttempt,
      passRate,
      averageDuration,
    };
  }
}
