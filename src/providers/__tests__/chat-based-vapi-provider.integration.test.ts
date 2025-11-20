/**
 * Integration tests for ChatBasedVapiProvider
 * Tests real end-to-end flows (can be skipped in CI if Claude CLI not available)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ChatBasedVapiProvider } from '../chat-based-vapi-provider.js';
import type { TestDefinition } from '../../types/index.js';
import { existsSync } from 'fs';
import { join } from 'path';

// These tests require:
// 1. Claude CLI to be installed
// 2. Valid Vapi API key
// 3. Valid Vapi Assistant ID
const SKIP_INTEGRATION_TESTS =
  !process.env.VAPI_API_KEY ||
  !process.env.VAPI_ASSISTANT_ID ||
  process.env.CI === 'true';

const describeIntegration = SKIP_INTEGRATION_TESTS ? describe.skip : describe;

describeIntegration('ChatBasedVapiProvider - Integration Tests', () => {
  let provider: ChatBasedVapiProvider;

  beforeAll(() => {
    const apiKey = process.env.VAPI_API_KEY;
    const assistantId = process.env.VAPI_ASSISTANT_ID;

    if (!apiKey || !assistantId) {
      throw new Error('Missing required environment variables for integration tests');
    }

    provider = new ChatBasedVapiProvider({
      apiKey,
      assistantId,
      verbose: false,
    });
  });

  it('should verify provider is configured', () => {
    const configured = provider.isConfigured();
    expect(configured).toBe(true);
  });

  it('should verify prompts are loaded', () => {
    const promptsDir = join(process.cwd(), 'prompts');
    expect(existsSync(join(promptsDir, 'conversation-generator.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'criterion-evaluator.md'))).toBe(true);
  });

  it('should execute a simple test successfully', async () => {
    const testDefinition: TestDefinition = {
      name: 'Integration Test - Simple Greeting',
      description: 'Test that assistant can handle a simple greeting',
      agent_id: process.env.VAPI_ASSISTANT_ID!,
      vapi: {
        assistant_id: process.env.VAPI_ASSISTANT_ID,
      },
      simulated_user: {
        prompt: 'You are a friendly user who wants to test the assistant. Start with a greeting.',
        first_message: 'Hello!',
        language: 'English',
      },
      evaluation_criteria: [
        {
          id: 'greeting-response',
          name: 'Greeting Response',
          prompt: 'Did the assistant respond to the greeting in a friendly manner?',
        },
      ],
    };

    const result = await provider.executeTest(testDefinition);

    // Verify result structure
    expect(result).toHaveProperty('test_name');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('simulation_response');
    expect(result).toHaveProperty('execution_time_ms');

    // Verify conversation was generated
    expect(result.simulation_response.simulated_conversation).toBeDefined();
    expect(result.simulation_response.simulated_conversation.length).toBeGreaterThan(0);

    // Verify evaluation was performed
    expect(result.simulation_response.analysis.evaluation_criteria_results).toBeDefined();
    expect(result.simulation_response.analysis.evaluation_criteria_results['greeting-response']).toBeDefined();

    // Log result for debugging
    console.log('\n=== Integration Test Result ===');
    console.log(`Test: ${result.test_name}`);
    console.log(`Success: ${result.success}`);
    console.log(`Execution Time: ${result.execution_time_ms}ms`);
    console.log(`Conversation Turns: ${result.simulation_response.simulated_conversation.length}`);
    console.log(`Vapi Cost: $${result.vapi_cost?.toFixed(4) || '0.0000'}`);

    const evalResults = result.simulation_response.analysis.evaluation_criteria_results;
    console.log('\nEvaluation Results:');
    for (const [id, evaluation] of Object.entries(evalResults)) {
      console.log(`  ${id}: ${evaluation.result}`);
      console.log(`    ${evaluation.rationale}`);
    }
  }, 120000); // 2 minute timeout for integration test

  it('should handle tests with multiple criteria', async () => {
    const testDefinition: TestDefinition = {
      name: 'Integration Test - Multi-Criteria',
      description: 'Test with multiple evaluation criteria',
      agent_id: process.env.VAPI_ASSISTANT_ID!,
      vapi: {
        assistant_id: process.env.VAPI_ASSISTANT_ID,
      },
      simulated_user: {
        prompt: 'You are asking about the assistant capabilities.',
        first_message: 'What can you help me with?',
        language: 'English',
      },
      evaluation_criteria: [
        {
          id: 'response-received',
          name: 'Response Received',
          prompt: 'Did the assistant provide any response?',
        },
        {
          id: 'relevant-response',
          name: 'Relevant Response',
          prompt: 'Was the response relevant to the question about capabilities?',
        },
      ],
    };

    const result = await provider.executeTest(testDefinition);

    expect(result.success).toBeDefined();

    const evalResults = result.simulation_response.analysis.evaluation_criteria_results;
    expect(Object.keys(evalResults).length).toBe(2);
    expect(evalResults['response-received']).toBeDefined();
    expect(evalResults['relevant-response']).toBeDefined();
  }, 120000);

  it('should handle tests with dynamic variables', async () => {
    const testDefinition: TestDefinition = {
      name: 'Integration Test - Dynamic Variables',
      description: 'Test with dynamic variable substitution',
      agent_id: process.env.VAPI_ASSISTANT_ID!,
      vapi: {
        assistant_id: process.env.VAPI_ASSISTANT_ID,
      },
      simulated_user: {
        prompt: 'You are {{userName}} and you want to know about {{topic}}.',
        first_message: 'Hi, I want to learn about your services',
        language: 'English',
      },
      dynamic_variables: {
        userName: 'John Smith',
        topic: 'AI testing',
      },
      evaluation_criteria: [
        {
          id: 'conversation-completed',
          name: 'Conversation Completed',
          prompt: 'Did the conversation reach a natural conclusion?',
        },
      ],
    };

    const result = await provider.executeTest(testDefinition);

    expect(result).toBeDefined();
    expect(result.simulation_response.simulated_conversation.length).toBeGreaterThan(0);
  }, 120000);

  it('should measure execution time accurately', async () => {
    const startTime = Date.now();

    const testDefinition: TestDefinition = {
      name: 'Integration Test - Timing',
      description: 'Verify execution time measurement',
      agent_id: process.env.VAPI_ASSISTANT_ID!,
      vapi: {
        assistant_id: process.env.VAPI_ASSISTANT_ID,
      },
      simulated_user: {
        prompt: 'Be brief in your responses.',
        first_message: 'Hello',
        language: 'English',
      },
    };

    const result = await provider.executeTest(testDefinition);
    const actualTime = Date.now() - startTime;

    // Execution time should be within reasonable range of actual time
    expect(result.execution_time_ms).toBeGreaterThan(0);
    expect(result.execution_time_ms).toBeLessThanOrEqual(actualTime + 1000); // 1s tolerance
    expect(result.execution_time_ms).toBeGreaterThanOrEqual(actualTime - 1000);
  }, 120000);

  it('should track Vapi API costs', async () => {
    const testDefinition: TestDefinition = {
      name: 'Integration Test - Cost Tracking',
      description: 'Verify Vapi cost tracking',
      agent_id: process.env.VAPI_ASSISTANT_ID!,
      vapi: {
        assistant_id: process.env.VAPI_ASSISTANT_ID,
      },
      simulated_user: {
        prompt: 'Have a short conversation.',
        first_message: 'Hi',
        language: 'English',
      },
    };

    const result = await provider.executeTest(testDefinition);

    // Cost should be tracked (may be 0 for free tier, but should be defined)
    expect(result).toHaveProperty('vapi_cost');
    expect(typeof result.vapi_cost).toBe('number');
    expect(result.vapi_cost).toBeGreaterThanOrEqual(0);
  }, 120000);
});

// Test suite for error scenarios
describeIntegration('ChatBasedVapiProvider - Error Handling', () => {
  let provider: ChatBasedVapiProvider;

  beforeAll(() => {
    provider = new ChatBasedVapiProvider({
      apiKey: process.env.VAPI_API_KEY!,
      assistantId: process.env.VAPI_ASSISTANT_ID!,
      verbose: false,
    });
  });

  it('should handle invalid assistant ID gracefully', async () => {
    const testDefinition: TestDefinition = {
      name: 'Error Test - Invalid Assistant',
      description: 'Test with invalid assistant ID',
      agent_id: 'invalid-assistant-id',
      vapi: {
        assistant_id: 'invalid-assistant-id',
      },
      simulated_user: {
        prompt: 'Test user',
        first_message: 'Hello',
        language: 'English',
      },
    };

    const result = await provider.executeTest(testDefinition);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toBeTruthy();
  }, 60000);

  it('should handle malformed test definitions', async () => {
    const testDefinition: TestDefinition = {
      name: 'Error Test - Malformed',
      description: 'Test with missing required fields',
      agent_id: undefined as any,
      simulated_user: {
        prompt: 'Test',
        first_message: 'Hello',
        language: 'English',
      },
    };

    const result = await provider.executeTest(testDefinition);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 60000);
});

// Export utility for manual testing
export function runManualIntegrationTest() {
  if (!process.env.VAPI_API_KEY || !process.env.VAPI_ASSISTANT_ID) {
    console.error('Missing required environment variables:');
    console.error('  VAPI_API_KEY');
    console.error('  VAPI_ASSISTANT_ID');
    process.exit(1);
  }

  console.log('Manual integration test would run here');
  console.log('Use: npm test -- chat-based-vapi-provider.integration.test.ts');
}
