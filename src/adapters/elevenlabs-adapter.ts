/**
 * Adaptador para ElevenLabs
 * Maneja conversión entre formato YAML y formato de API de ElevenLabs
 */

import type {
  TestDefinition,
  SimulationSpecification,
  SimulatedUserConfig,
  TestEvaluationCriterion,
  EvaluationCriterion,
} from '../types/index.js';

export class ElevenLabsAdapter {
  /**
   * Convierte una TestDefinition (YAML) a SimulationSpecification (API de ElevenLabs)
   */
  convertTestDefinition(test: TestDefinition): SimulationSpecification {
    return {
      simulation_specification: {
        simulated_user_config: this.convertSimulatedUserConfig(test.simulated_user),
        tool_mock_config: test.tool_mock_config,
        partial_conversation_history: test.partial_conversation_history,
        dynamic_variables: test.dynamic_variables,
      },
      extra_evaluation_criteria: this.convertEvaluationCriteria(test.evaluation_criteria),
      new_turns_limit: test.new_turns_limit,
    };
  }

  /**
   * Convierte SimulatedUserConfigYAML (string simple) a SimulatedUserConfig (objeto)
   */
  private convertSimulatedUserConfig(userYAML: any): SimulatedUserConfig {
    return {
      prompt: {
        prompt: userYAML.prompt,  // El prompt es un string en YAML
        llm: userYAML.llm,
        temperature: userYAML.temperature,
        max_tokens: userYAML.max_tokens,
      },
      first_message: userYAML.first_message,
      language: userYAML.language,
      tools: userYAML.tools,
    };
  }

  /**
   * Convierte criterios de evaluación desde formato YAML a formato API
   */
  private convertEvaluationCriteria(
    criteria?: TestEvaluationCriterion[]
  ): EvaluationCriterion[] | undefined {
    if (!criteria || criteria.length === 0) {
      return undefined;
    }

    return criteria.map(c => ({
      id: c.id,
      name: c.name,
      type: 'prompt' as const,
      // Usar prompt o conversation_goal_prompt, lo que esté disponible
      conversation_goal_prompt: c.conversation_goal_prompt || c.prompt || '',
      use_knowledge_base: c.use_knowledge_base ?? false,
    }));
  }

  /**
   * Normaliza referencias a variables para ElevenLabs
   * ElevenLabs usa ${VAR} en lugar de {{VAR}}
   */
  normalizeVariableReferences(text: string): string {
    // {{VAR}} → ${VAR}
    return text.replace(/\{\{(\w+)\}\}/g, '${$1}');
  }
}
