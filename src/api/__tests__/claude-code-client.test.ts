/**
 * Unit tests for ClaudeCodeClient
 * Tests Claude Code CLI integration and evaluation logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeClient, type EvaluationResult } from '../claude-code-client.js';
import { spawn } from 'child_process';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { EventEmitter } from 'events';

// Mock Node.js modules
vi.mock('child_process');
vi.mock('fs');

describe('ClaudeCodeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const client = new ClaudeCodeClient();
      expect(client).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const client = new ClaudeCodeClient({
        timeout: 60000,
        verbose: true,
      });
      expect(client).toBeDefined();
    });
  });

  describe('findClaudePath', () => {
    it('should find claude executable in common paths', async () => {
      // Mock existsSync to return true for a specific path
      vi.mocked(existsSync).mockImplementation((path: any) => {
        return path === '/usr/local/bin/claude';
      });

      const client = new ClaudeCodeClient({ verbose: false });

      // Access private method through type assertion
      const findClaudePath = (client as any).findClaudePath.bind(client);
      const result = findClaudePath();

      expect(result).toBe('/usr/local/bin/claude');
    });

    it('should use fallback when no path is found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const client = new ClaudeCodeClient({ verbose: false });
      const findClaudePath = (client as any).findClaudePath.bind(client);
      const result = findClaudePath();

      expect(result).toBe('claude');
    });

    it('should cache the found path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const client = new ClaudeCodeClient({ verbose: false });
      const findClaudePath = (client as any).findClaudePath.bind(client);

      const result1 = findClaudePath();
      const result2 = findClaudePath();

      expect(result1).toBe(result2);
      // existsSync should only be called once due to caching
    });
  });

  describe('executeCommand', () => {
    it('should execute command successfully', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);

      const client = new ClaudeCodeClient({ verbose: false });
      const executeCommand = (client as any).executeCommand.bind(client);

      const promise = executeCommand('test', ['arg1']);

      // Simulate stdout data
      mockChild.stdout.emit('data', Buffer.from('test output'));

      // Simulate successful completion
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result.stdout).toBe('test output');
      expect(result.code).toBe(0);
    });

    it('should handle command errors', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);

      const client = new ClaudeCodeClient({ verbose: false });
      const executeCommand = (client as any).executeCommand.bind(client);

      const promise = executeCommand('test', ['arg1']);

      // Simulate error
      setTimeout(() => mockChild.emit('error', new Error('Command failed')), 10);

      await expect(promise).rejects.toThrow('Failed to execute command');
    });

    it('should timeout long-running commands', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);

      const client = new ClaudeCodeClient({
        verbose: false,
        timeout: 100, // Short timeout
      });
      const executeCommand = (client as any).executeCommand.bind(client);

      const promise = executeCommand('test', ['arg1']);

      // Don't complete the command - let it timeout

      await expect(promise).rejects.toThrow('Command timed out after 100ms');
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should capture stderr output', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);

      const client = new ClaudeCodeClient({ verbose: false });
      const executeCommand = (client as any).executeCommand.bind(client);

      const promise = executeCommand('test', ['arg1']);

      mockChild.stderr.emit('data', Buffer.from('error output'));
      setTimeout(() => mockChild.emit('close', 1), 10);

      const result = await promise;

      expect(result.stderr).toBe('error output');
      expect(result.code).toBe(1);
    });
  });

  describe('executeClaudeCode', () => {
    it('should write prompt to temp file and execute claude', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });
      const executeClaudeCode = (client as any).executeClaudeCode.bind(client);

      const promise = executeClaudeCode('test prompt');

      mockChild.stdout.emit('data', Buffer.from('claude response'));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(writeFileSync).toHaveBeenCalled();
      expect(result).toBe('claude response');
      expect(unlinkSync).toHaveBeenCalled();
    });

    it('should cleanup temp file even on error', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });
      const executeClaudeCode = (client as any).executeClaudeCode.bind(client);

      const promise = executeClaudeCode('test prompt');

      setTimeout(() => mockChild.emit('close', 1), 10);

      await expect(promise).rejects.toThrow();
      expect(unlinkSync).toHaveBeenCalled();
    });

    it('should handle errors when cleaning up temp file', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      const client = new ClaudeCodeClient({ verbose: false });
      const executeClaudeCode = (client as any).executeClaudeCode.bind(client);

      const promise = executeClaudeCode('test prompt');

      mockChild.stdout.emit('data', Buffer.from('response'));
      setTimeout(() => mockChild.emit('close', 0), 10);

      // Should not throw even if cleanup fails
      const result = await promise;
      expect(result).toBe('response');
    });
  });

  describe('generateConversation', () => {
    it('should generate conversation successfully', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const promise = client.generateConversation('Generate a conversation');

      const output = '1. Hello\n2. How are you?\n3. Goodbye';
      mockChild.stdout.emit('data', Buffer.from(output));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result).toBe(output);
    });
  });

  describe('evaluateCriterion', () => {
    it('should parse pass result correctly', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const promise = client.evaluateCriterion(
        'USER: Hello\nASSISTANT: Hi there!',
        'Did the assistant greet the user?'
      );

      const output = 'RESULT: pass\nREASONING: The assistant greeted the user properly';
      mockChild.stdout.emit('data', Buffer.from(output));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result.passed).toBe(true);
      expect(result.reasoning).toBe('The assistant greeted the user properly');
    });

    it('should parse fail result correctly', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const promise = client.evaluateCriterion(
        'USER: Hello\nASSISTANT: ...',
        'Did the assistant greet the user?'
      );

      const output = 'RESULT: fail\nREASONING: The assistant did not provide a proper greeting';
      mockChild.stdout.emit('data', Buffer.from(output));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result.passed).toBe(false);
      expect(result.reasoning).toBe('The assistant did not provide a proper greeting');
    });

    it('should handle malformed output', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const promise = client.evaluateCriterion(
        'conversation',
        'criteria'
      );

      const output = 'Some invalid output without proper format';
      mockChild.stdout.emit('data', Buffer.from(output));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result.passed).toBe(false);
      expect(result.reasoning).toContain('Failed to parse');
    });

    it('should handle case-insensitive RESULT values', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const promise = client.evaluateCriterion('conversation', 'criteria');

      const output = 'RESULT: PASS\nREASONING: Test passed';
      mockChild.stdout.emit('data', Buffer.from(output));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result.passed).toBe(true);
    });

    it('should handle missing reasoning', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockChild);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const promise = client.evaluateCriterion('conversation', 'criteria');

      const output = 'RESULT: pass';
      mockChild.stdout.emit('data', Buffer.from(output));
      setTimeout(() => mockChild.emit('close', 0), 10);

      const result = await promise;

      expect(result.passed).toBe(true);
      expect(result.reasoning).toBe('No reasoning provided');
    });
  });

  describe('evaluateMultipleCriteria', () => {
    it('should evaluate multiple criteria sequentially', async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();

      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        const child = new EventEmitter() as any;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = vi.fn();

        // Emit different responses for each call
        setTimeout(() => {
          callCount++;
          const output = callCount === 1
            ? 'RESULT: pass\nREASONING: First criterion passed'
            : 'RESULT: fail\nREASONING: Second criterion failed';
          child.stdout.emit('data', Buffer.from(output));
          child.emit('close', 0);
        }, 10);

        return child;
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(writeFileSync).mockImplementation(() => {});
      vi.mocked(unlinkSync).mockImplementation(() => {});

      const client = new ClaudeCodeClient({ verbose: false });

      const results = await client.evaluateMultipleCriteria(
        'conversation text',
        [
          { id: 'crit1', prompt: 'First criterion' },
          { id: 'crit2', prompt: 'Second criterion' },
        ]
      );

      expect(results).toHaveProperty('crit1');
      expect(results).toHaveProperty('crit2');
      expect(results.crit1.passed).toBe(true);
      expect(results.crit2.passed).toBe(false);
    });

    it('should handle empty criteria list', async () => {
      const client = new ClaudeCodeClient({ verbose: false });

      const results = await client.evaluateMultipleCriteria('conversation', []);

      expect(results).toEqual({});
    });
  });
});
