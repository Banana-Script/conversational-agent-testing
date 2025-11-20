/**
 * Unit tests for ChatBasedVapiProvider
 * Tests conversation generation, execution, and evaluation flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatBasedVapiProvider } from '../chat-based-vapi-provider.js';
import type { TestDefinition, TestResult } from '../../types/index.js';
import { VapiClient } from '../../api/vapi-client.js';
import { ClaudeCodeClient } from '../../api/claude-code-client.js';

// Mock dependencies
vi.mock('../../api/vapi-client.js', () => ({
  VapiClient: vi.fn(),
}));
vi.mock('../../api/claude-code-client.js', () => ({
  ClaudeCodeClient: vi.fn(),
}));
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('ChatBasedVapiProvider', () => {
  const mockApiKey = 'test-api-key';
  const mockAssistantId = 'test-assistant-id';

  const mockConversationPrompt = `# Conversation Generation
User: {{USER_PROMPT}}
First: {{FIRST_MESSAGE}}
Language: {{LANGUAGE}}
Variables: {{VARIABLES}}`;

  const mockCriterionPrompt = `# Criterion Evaluation
Name: {{CRITERION_NAME}}
Prompt: {{CRITERION_PROMPT}}`;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset constructor mocks
    vi.mocked(VapiClient).mockImplementation(() => ({}) as any);
    vi.mocked(ClaudeCodeClient).mockImplementation(() => ({}) as any);

    // Mock fs.readFileSync for loading prompts
    const { readFileSync } = await import('fs');
    vi.mocked(readFileSync).mockReturnValue(mockConversationPrompt);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (path.includes('conversation-generator.md')) {
        return mockConversationPrompt;
      }
      if (path.includes('criterion-evaluator.md')) {
        return mockCriterionPrompt;
      }
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
        assistantId: mockAssistantId,
      });

      expect(provider).toBeDefined();
      expect(provider.name).toBe('vapi-chat');
    });

    it('should load prompts from file system', async () => {
      const { readFileSync } = await import('fs');
      const spy = vi.mocked(readFileSync);

      new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('conversation-generator.md'),
        'utf-8'
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('criterion-evaluator.md'),
        'utf-8'
      );
    });

    it('should throw error if prompt file is missing', async () => {
      const { readFileSync } = await import('fs');
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => {
        new ChatBasedVapiProvider({
          apiKey: mockApiKey,
        });
      }).toThrow(/Failed to load prompt/);
    });
  });

  describe('validateTest', () => {
    it('should validate test with required fields', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
        assistantId: mockAssistantId,
      });

      const validTest: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        vapi: {
          assistant_id: 'assistant-123',
        },
        simulated_user: {
          prompt: 'User prompt',
          first_message: 'Hello',
          language: 'en',
        },
      };

      // Should not throw
      expect(() => {
        (provider as any).validateTest(validTest);
      }).not.toThrow();
    });

    it('should throw error if assistant_id is missing', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const invalidTest: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: undefined as any,
        simulated_user: {
          prompt: 'User prompt',
          first_message: 'Hello',
          language: 'en',
        },
      };

      expect(() => {
        (provider as any).validateTest(invalidTest);
      }).toThrow(/must have vapi.assistant_id or agent_id/);
    });

    it('should throw error if simulated_user is missing', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const invalidTest: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        simulated_user: undefined as any,
      };

      expect(() => {
        (provider as any).validateTest(invalidTest);
      }).toThrow(/must have simulated_user/);
    });

    it('should throw error if prompt is missing', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const invalidTest: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        simulated_user: {
          prompt: undefined as any,
          first_message: 'Hello',
          language: 'en',
        },
      };

      expect(() => {
        (provider as any).validateTest(invalidTest);
      }).toThrow(/must have prompt/);
    });

    it('should throw error if first_message is missing', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const invalidTest: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        simulated_user: {
          prompt: 'User prompt',
          first_message: undefined as any,
          language: 'en',
        },
      };

      expect(() => {
        (provider as any).validateTest(invalidTest);
      }).toThrow(/must have first_message/);
    });
  });

  describe('interpolateTemplate', () => {
    it('should interpolate variables in template', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const template = 'Hello {{NAME}}, you are {{AGE}} years old';
      const variables = { NAME: 'John', AGE: '25' };

      const result = (provider as any).interpolateTemplate(template, variables);

      expect(result).toBe('Hello John, you are 25 years old');
    });

    it('should handle multiple occurrences of same variable', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const template = '{{VAR}} and {{VAR}} again';
      const variables = { VAR: 'test' };

      const result = (provider as any).interpolateTemplate(template, variables);

      expect(result).toBe('test and test again');
    });

    it('should not modify template if no variables match', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const template = 'Hello {{MISSING}}';
      const variables = { OTHER: 'value' };

      const result = (provider as any).interpolateTemplate(template, variables);

      expect(result).toBe('Hello {{MISSING}}');
    });
  });

  describe('parseUserMessages', () => {
    it('should parse numbered messages correctly', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const response = `1. Hello there
2. How are you?
3. Goodbye`;

      const messages = (provider as any).parseUserMessages(response, 'Hello there');

      expect(messages).toEqual([
        'Hello there',
        'How are you?',
        'Goodbye',
      ]);
    });

    it('should handle messages with parentheses numbering', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const response = `1) First message
2) Second message
3) Third message`;

      const messages = (provider as any).parseUserMessages(response, 'First message');

      expect(messages).toEqual([
        'First message',
        'Second message',
        'Third message',
      ]);
    });

    it('should trim whitespace from messages', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const response = `1.    Hello with spaces
2.    Goodbye with spaces   `;

      const messages = (provider as any).parseUserMessages(response, 'Hello with spaces');

      expect(messages).toEqual([
        'Hello with spaces',
        'Goodbye with spaces',
      ]);
    });

    it('should warn and fix first message mismatch', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const response = `1. Wrong first message
2. Second message`;

      const messages = (provider as any).parseUserMessages(response, 'Expected first message');

      expect(messages[0]).toBe('Expected first message');
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should throw error if no messages found', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const response = 'No numbered messages here';

      expect(() => {
        (provider as any).parseUserMessages(response, 'First message');
      }).toThrow(/Failed to parse user messages/);
    });

    it('should ignore empty lines', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const response = `
1. First message

2. Second message

`;

      const messages = (provider as any).parseUserMessages(response, 'First message');

      expect(messages).toEqual([
        'First message',
        'Second message',
      ]);
    });
  });

  describe('conversationToText', () => {
    it('should convert conversation to text format', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const conversation = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const text = (provider as any).conversationToText(conversation);

      expect(text).toBe('USER: Hello\n\nASSISTANT: Hi there!\n\nUSER: How are you?');
    });

    it('should handle empty conversation', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const text = (provider as any).conversationToText([]);

      expect(text).toBe('');
    });
  });

  describe('convertToConversationTurns', () => {
    it('should convert ChatMessage to ConversationTurn format', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      const turns = (provider as any).convertToConversationTurns(messages);

      expect(turns).toEqual([
        { role: 'user', message: 'Hello' },
        { role: 'agent', message: 'Hi there!' },
      ]);
    });
  });

  describe('generateTranscriptSummary', () => {
    it('should generate summary of conversation', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const conversation = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi' },
        { role: 'user' as const, content: 'Bye' },
      ];

      const summary = (provider as any).generateTranscriptSummary(conversation);

      expect(summary).toContain('2 user messages');
      expect(summary).toContain('1 assistant responses');
      expect(summary).toContain('Total turns: 3');
    });
  });

  describe('buildCriterionPrompt', () => {
    it('should build prompt from criterion with prompt field', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const criterion = {
        id: 'test-criterion',
        name: 'Test Criterion',
        prompt: 'Did the assistant greet the user?',
      };

      const prompt = (provider as any).buildCriterionPrompt(criterion);

      expect(prompt).toContain('Test Criterion');
      expect(prompt).toContain('Did the assistant greet the user?');
    });

    it('should use conversation_goal_prompt if prompt is missing', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const criterion = {
        id: 'test-criterion',
        name: 'Test Criterion',
        conversation_goal_prompt: 'Was the goal achieved?',
      };

      const prompt = (provider as any).buildCriterionPrompt(criterion);

      expect(prompt).toContain('Was the goal achieved?');
    });

    it('should fallback to name if no prompt fields exist', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const criterion = {
        id: 'test-criterion',
        name: 'Test Criterion',
      };

      const prompt = (provider as any).buildCriterionPrompt(criterion);

      expect(prompt).toContain('Test Criterion');
    });
  });

  describe('isConfigured', () => {
    it('should return true when properly configured', () => {
      const mockClaudeClient = {
        findClaudePath: vi.fn().mockReturnValue('/usr/local/bin/claude'),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const result = provider.isConfigured();

      expect(result).toBe(true);
    });

    it('should return false if Claude CLI not found', () => {
      const mockClaudeClient = {
        findClaudePath: vi.fn().mockImplementation(() => {
          throw new Error('Claude not found');
        }),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const result = provider.isConfigured();

      expect(result).toBe(false);
    });
  });

  describe('getInfo', () => {
    it('should return provider information', () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const info = provider.getInfo();

      expect(info.name).toBe('vapi-chat');
      expect(info.version).toBe('1.0.0');
      expect(info.capabilities).toContain('multi-turn-conversations');
      expect(info.capabilities).toContain('chat-api');
      expect(info.capabilities).toContain('claude-code-evaluation');
      expect(info.capabilities).toContain('real-time-responses');
    });
  });

  describe('generateUserMessages', () => {
    it('should generate user messages from test definition', async () => {
      const mockClaudeClient = {
        generateConversation: vi.fn().mockResolvedValue(
          '1. Hello\n2. How are you?\n3. Goodbye'
        ),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const test: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        simulated_user: {
          prompt: 'Be friendly',
          first_message: 'Hello',
          language: 'en',
        },
        dynamic_variables: {
          name: 'John',
          age: '25',
        },
      };

      const messages = await (provider as any).generateUserMessages(test);

      expect(messages).toEqual(['Hello', 'How are you?', 'Goodbye']);
      expect(mockClaudeClient.generateConversation).toHaveBeenCalled();
    });

    it('should throw error if simulated_user is missing', async () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const test: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        simulated_user: undefined as any,
      };

      await expect((provider as any).generateUserMessages(test)).rejects.toThrow(
        /must have simulated_user/
      );
    });

    it('should handle dynamic variables in prompt', async () => {
      const mockClaudeClient = {
        generateConversation: vi.fn().mockResolvedValue('1. Message'),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const test: TestDefinition = {
        name: 'Test',
        description: 'Test description',
        agent_id: 'agent-123',
        simulated_user: {
          prompt: 'User prompt',
          first_message: 'Hello',
          language: 'en',
        },
        dynamic_variables: {
          name: 'John',
        },
      };

      await (provider as any).generateUserMessages(test);

      const callArg = mockClaudeClient.generateConversation.mock.calls[0][0];
      expect(callArg).toContain('{{name}}: John');
    });
  });

  describe('evaluateCriteria', () => {
    it('should evaluate all criteria successfully', async () => {
      const mockClaudeClient = {
        evaluateCriterion: vi.fn()
          .mockResolvedValueOnce({ passed: true, reasoning: 'Criterion 1 passed' })
          .mockResolvedValueOnce({ passed: false, reasoning: 'Criterion 2 failed' }),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const conversation = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      const criteria = [
        { id: 'crit1', name: 'Criterion 1', prompt: 'Did greet?' },
        { id: 'crit2', name: 'Criterion 2', prompt: 'Was polite?' },
      ];

      const results = await (provider as any).evaluateCriteria(conversation, criteria);

      expect(results).toHaveProperty('crit1');
      expect(results).toHaveProperty('crit2');
      expect(results.crit1.result).toBe('success');
      expect(results.crit2.result).toBe('failure');
    });

    it('should return empty object for empty criteria list', async () => {
      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const results = await (provider as any).evaluateCriteria([], []);

      expect(results).toEqual({});
    });

    it('should handle evaluation errors gracefully', async () => {
      const mockClaudeClient = {
        evaluateCriterion: vi.fn().mockRejectedValue(new Error('Evaluation failed')),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
      });

      const conversation = [
        { role: 'user' as const, content: 'Hello' },
      ];

      const criteria = [
        { id: 'crit1', name: 'Criterion 1', prompt: 'Test?' },
      ];

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const results = await (provider as any).evaluateCriteria(conversation, criteria);

      expect(results.crit1.result).toBe('failure');
      expect(results.crit1.rationale).toContain('Evaluation failed');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('executeTest - integration', () => {
    it('should execute complete test successfully', async () => {
      const mockClaudeClient = {
        generateConversation: vi.fn().mockResolvedValue(
          '1. Hello\n2. How are you?'
        ),
        evaluateCriterion: vi.fn().mockResolvedValue({
          passed: true,
          reasoning: 'Test passed',
        }),
      };

      const mockVapiClient = {
        runMultiTurnConversation: vi.fn().mockResolvedValue({
          chats: [],
          fullConversation: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
            { role: 'assistant', content: 'I am doing well!' },
          ],
          totalCost: 0.001,
        }),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);
      vi.mocked(VapiClient).mockImplementation(() => mockVapiClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
        assistantId: mockAssistantId,
      });

      const test: TestDefinition = {
        name: 'Integration Test',
        description: 'Test description',
        agent_id: 'agent-123',
        vapi: {
          assistant_id: 'assistant-123',
        },
        simulated_user: {
          prompt: 'Be friendly',
          first_message: 'Hello',
          language: 'en',
        },
        evaluation_criteria: [
          { id: 'crit1', name: 'Greeting', prompt: 'Did greet?' },
        ],
      };

      const result = await provider.executeTest(test);

      expect(result.success).toBe(true);
      expect(result.test_name).toBe('Integration Test');
      expect(result.simulation_response.simulated_conversation.length).toBeGreaterThan(0);
      expect(result.vapi_cost).toBe(0.001);
      expect(mockClaudeClient.generateConversation).toHaveBeenCalled();
      expect(mockVapiClient.runMultiTurnConversation).toHaveBeenCalled();
      expect(mockClaudeClient.evaluateCriterion).toHaveBeenCalled();
    });

    it('should handle test execution errors', async () => {
      const mockClaudeClient = {
        generateConversation: vi.fn().mockRejectedValue(
          new Error('Generation failed')
        ),
      };

      vi.mocked(ClaudeCodeClient).mockImplementation(() => mockClaudeClient as any);

      const provider = new ChatBasedVapiProvider({
        apiKey: mockApiKey,
        assistantId: mockAssistantId,
      });

      const test: TestDefinition = {
        name: 'Failing Test',
        description: 'Test description',
        agent_id: 'agent-123',
        vapi: {
          assistant_id: 'assistant-123',
        },
        simulated_user: {
          prompt: 'Be friendly',
          first_message: 'Hello',
          language: 'en',
        },
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await provider.executeTest(test);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Generation failed');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
