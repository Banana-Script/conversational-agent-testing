/**
 * Adaptador para Viernes
 * Maneja conversión entre formato YAML y formato de API de Viernes
 */

import type {
  TestDefinition,
  TestResult,
  SimulationResponse,
  ConversationTurn,
  EvaluationResult,
} from '../types/index.js';
import type {
  ViernesSimulationRequest,
  ViernesSimulationResponse,
  ViernesEvaluationCriterion,
  ViernesSimulatedUserConfig,
  ViernesExpectedStructuredDataField,
} from '../types/viernes.types.js';

export class ViernesAdapter {
  /**
   * Convert TestDefinition (YAML) to ViernesSimulationRequest (API format)
   */
  convertTestDefinition(
    test: TestDefinition,
    organizationId: number,
    agentId: number
  ): ViernesSimulationRequest {
    return {
      organization_id: organizationId,
      agent_id: agentId,
      platform: this.determinePlatform(test),
      simulated_user_config: this.convertSimulatedUserConfig(test),
      max_turns: test.viernes?.max_turns || test.new_turns_limit || 10,
      conversation_timeout: test.viernes?.conversation_timeout || 300,
      webhook_timeout: test.viernes?.webhook_timeout || 120,
      evaluation_criteria: this.convertEvaluationCriteria(test.evaluation_criteria),
      expected_structured_data: this.convertExpectedStructuredData(test.expected_structured_data),
    };
  }

  /**
   * Convert expected structured data from YAML to API format (pass-through)
   */
  private convertExpectedStructuredData(
    data?: TestDefinition['expected_structured_data']
  ): ViernesExpectedStructuredDataField[] | undefined {
    if (!data || data.length === 0) {
      return undefined;
    }
    return data as ViernesExpectedStructuredDataField[];
  }

  /**
   * Convert simulated user config from YAML format to Viernes API format
   */
  private convertSimulatedUserConfig(test: TestDefinition): ViernesSimulatedUserConfig {
    const user = test.simulated_user;

    return {
      persona: user.prompt,
      model: this.normalizeModel(user.llm),
      temperature: user.temperature ?? 0.7,
      initial_message: user.first_message,
      max_tokens: user.max_tokens ?? 150,
      provider: null, // Auto-detect from model
    };
  }

  /**
   * Normalize model name to Viernes format
   */
  private normalizeModel(llm?: string): ViernesSimulatedUserConfig['model'] {
    if (!llm) return 'gpt-4o-mini';

    const normalized = llm.toLowerCase();
    if (normalized.includes('gpt-4o-mini')) return 'gpt-4o-mini';
    if (normalized.includes('gpt-4o')) return 'gpt-4o';
    if (normalized.includes('llama3.2')) return 'ollama/llama3.2';
    if (normalized.includes('llama3.1')) return 'ollama/llama3.1';

    return 'gpt-4o-mini'; // Safe default
  }

  /**
   * Convert evaluation criteria from framework format to Viernes format
   * Maps: name → goal, prompt → evaluation_prompt
   */
  private convertEvaluationCriteria(
    criteria?: Array<{ id: string; name: string; prompt?: string; conversation_goal_prompt?: string }>
  ): ViernesEvaluationCriterion[] | undefined {
    if (!criteria || criteria.length === 0) {
      return undefined;
    }

    return criteria.map(c => ({
      id: c.id,
      goal: c.name, // name becomes goal
      evaluation_prompt: c.conversation_goal_prompt || c.prompt || '', // prompt becomes evaluation_prompt
    }));
  }

  /**
   * Determine platform from test config
   */
  private determinePlatform(test: TestDefinition): ViernesSimulationRequest['platform'] {
    return test.viernes?.platform || 'whatsapp';
  }

  /**
   * Convert Viernes API response to unified TestResult format
   */
  convertToTestResult(
    response: ViernesSimulationResponse,
    test: TestDefinition
  ): TestResult {
    const success = this.determineSuccess(response);

    return {
      test_name: test.name,
      agent_id: test.agent_id,
      timestamp: new Date().toISOString(),
      success,
      simulation_response: this.convertToSimulationResponse(response),
      execution_time_ms: response.duration_secs * 1000,
    };
  }

  /**
   * Determine if test was successful based on Viernes response
   */
  private determineSuccess(response: ViernesSimulationResponse): boolean {
    if (response.status !== 'completed') return false;
    if (response.analysis.call_successful !== 'success') return false;

    // Check evaluation criteria results
    const results = response.analysis.evaluation_criteria_results;
    if (results && results.length > 0) {
      if (!results.every(r => r.success)) return false;
    }

    // Check structured data evaluation
    if (response.analysis.structured_data_evaluation) {
      if (!response.analysis.structured_data_evaluation.all_passed) return false;
    }

    return true;
  }

  /**
   * Convert Viernes response to unified SimulationResponse format
   */
  private convertToSimulationResponse(
    response: ViernesSimulationResponse
  ): SimulationResponse {
    const analysis: SimulationResponse['analysis'] = {
      evaluation_criteria_results: this.convertEvaluationResults(
        response.analysis.evaluation_criteria_results
      ),
      data_collection_results: {},
      call_success: response.analysis.call_successful === 'success',
      transcript_summary: response.analysis.transcript_summary ||
        `Simulation ${response.status}. Performance score: ${response.analysis.agent_performance_score}`,
    };

    // Include structured data evaluation if present
    if (response.analysis.structured_data_evaluation) {
      analysis.structured_data_evaluation = response.analysis.structured_data_evaluation;
    }

    return {
      simulated_conversation: this.convertTranscript(response.transcript),
      analysis,
    };
  }

  /**
   * Convert Viernes transcript to unified ConversationTurn format
   */
  private convertTranscript(turns: ViernesSimulationResponse['transcript']): ConversationTurn[] {
    return turns.map(turn => ({
      role: turn.role,
      message: turn.message,
      tool_calls: turn.tool_calls,
      timestamp: turn.timestamp,
    }));
  }

  /**
   * Convert Viernes evaluation results to unified format
   */
  private convertEvaluationResults(
    results: ViernesSimulationResponse['analysis']['evaluation_criteria_results']
  ): Record<string, EvaluationResult> {
    const converted: Record<string, EvaluationResult> = {};

    for (const result of results) {
      converted[result.criterion_id] = {
        criteria_id: result.criterion_id,
        result: result.success ? 'success' : 'failure',
        rationale: result.rationale,
      };
    }

    return converted;
  }
}
