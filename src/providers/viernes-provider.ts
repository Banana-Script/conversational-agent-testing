/**
 * Provider para Viernes
 * Implementa la interfaz TestProvider para tests de Viernes
 */

import { BaseTestProvider } from './base-provider.js';
import { ViernesClient } from '../api/viernes-client.js';
import { ViernesAdapter } from '../adapters/viernes-adapter.js';
import type { TestDefinition, TestResult } from '../types/index.js';
import type { ViernesConfig } from '../types/viernes.types.js';

export class ViernesProvider extends BaseTestProvider {
  readonly name = 'viernes';
  private client: ViernesClient;
  private adapter: ViernesAdapter;
  private config: ViernesConfig;

  constructor(config: ViernesConfig) {
    super();
    this.config = config;
    this.client = new ViernesClient(config);
    this.adapter = new ViernesAdapter();
  }

  /**
   * Execute a single test with Viernes
   */
  async executeTest(test: TestDefinition): Promise<TestResult> {
    this.validateTest(test);

    const startTime = Date.now();

    try {
      // Extract organization_id and agent_id
      const { organizationId, agentId } = this.extractAgentConfig(test);

      // Convert test to Viernes API format
      const request = this.adapter.convertTestDefinition(test, organizationId, agentId);

      // Execute simulation
      const response = await this.client.simulateConversation(
        request,
        (status) => console.log(`[Viernes] ${status}`)
      );

      const executionTime = Date.now() - startTime;

      // Convert to unified TestResult format
      const result = this.adapter.convertToTestResult(response, test);
      result.execution_time_ms = executionTime;

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

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
   * Extract organization_id and agent_id from test config
   */
  private extractAgentConfig(test: TestDefinition): { organizationId: number; agentId: number } {
    // Priority: viernes.organization_id > VIERNES_ORGANIZATION_ID env
    const organizationId =
      test.viernes?.organization_id ||
      (this.config.organizationId ? parseInt(this.config.organizationId, 10) : undefined);

    if (!organizationId) {
      throw new Error(
        'organization_id is required. Set it in test config (viernes.organization_id) or VIERNES_ORGANIZATION_ID env var.'
      );
    }

    // Priority: viernes.agent_id > agent_id field
    const agentId = test.viernes?.agent_id || parseInt(test.agent_id, 10);

    if (!agentId || isNaN(agentId)) {
      throw new Error(
        'agent_id must be a valid number. Set it in test config (viernes.agent_id or agent_id field).'
      );
    }

    return { organizationId, agentId };
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    // Viernes may not require API key depending on deployment
    // At minimum, we need organization_id
    return !!(this.config.organizationId || process.env.VIERNES_ORGANIZATION_ID);
  }

  /**
   * Provider information
   */
  getInfo() {
    return {
      name: this.name,
      version: '1.0.0',
      capabilities: [
        'chat-testing',
        'multi-platform',
        'llm-simulated-users',
        'automatic-evaluation',
        'quality-metrics',
        'performance-scoring',
      ],
    };
  }

  /**
   * Execute multiple tests sequentially
   */
  async executeBatch(tests: TestDefinition[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const result = await this.executeTest(test);
        results.push(result);
      } catch (error: any) {
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
   * Get underlying Viernes client for advanced operations
   */
  getClient(): ViernesClient {
    return this.client;
  }
}
