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

    console.log(`[Viernes] Starting test: ${test.name}`);
    const startTime = Date.now();

    try {
      // Extract organization_id and agent_id
      const { organizationId, agentId } = this.extractAgentConfig(test);

      // Convert test to Viernes API format
      const request = this.adapter.convertTestDefinition(test, organizationId, agentId);

      // Execute simulation with queue handling
      const response = await this.client.simulateConversationWithQueue(
        request,
        (status) => console.log(`[Viernes] ${status}`)
      );

      const executionTime = Date.now() - startTime;

      // Convert to unified TestResult format
      const result = this.adapter.convertToTestResult(response, test);
      result.execution_time_ms = executionTime;

      console.log(`[Viernes] Completed test: ${test.name} (${executionTime}ms)`);
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
   * Execute multiple tests with concurrency support
   * Concurrency limit is controlled by the ViernesQueue (default: 3)
   * Tests are processed in parallel up to the configured limit
   * Uses Promise.allSettled to ensure one test failure doesn't affect others
   */
  async executeBatch(tests: TestDefinition[]): Promise<TestResult[]> {
    console.log(`[Viernes] Executing ${tests.length} tests with max 3 concurrent simulations`);

    // Execute all tests concurrently - the queue will handle concurrency limits
    const promises = tests.map((test) => this.executeTest(test));

    // Use allSettled to ensure error isolation - one test failure won't affect others
    const results = await Promise.allSettled(promises);

    return results.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      // Handle rejected promise - create error result
      const error = result.reason;
      return {
        test_name: tests[idx].name,
        agent_id: tests[idx].agent_id,
        timestamp: new Date().toISOString(),
        success: false,
        simulation_response: {
          simulated_conversation: [],
          analysis: {
            evaluation_criteria_results: {},
            data_collection_results: {},
            call_success: false,
            transcript_summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        },
        execution_time_ms: 0,
      };
    });
  }

  /**
   * Get underlying Viernes client for advanced operations
   */
  getClient(): ViernesClient {
    return this.client;
  }
}
