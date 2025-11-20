/**
 * Cliente para ejecutar Claude Code CLI o Anthropic API
 * Basado en la lógica de scripts/lib/test-generator.js
 *
 * Prioridad:
 * 1. Anthropic API (si ANTHROPIC_API_KEY está disponible) - Más confiable
 * 2. Claude Code CLI (fallback) - Sin costo pero menos confiable
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeCodeOptions {
  timeout?: number; // Timeout en ms (default: 120000 = 2 min)
  verbose?: boolean; // Mostrar logs detallados
}

export interface EvaluationResult {
  passed: boolean;
  reasoning: string;
}

export class ClaudeCodeClient {
  private claudePath: string | null = null;
  private options: Required<ClaudeCodeOptions>;
  private anthropic: Anthropic | null = null;
  private useAnthropicAPI: boolean = false;

  constructor(options: ClaudeCodeOptions = {}) {
    this.options = {
      timeout: options.timeout || 120000,
      verbose: options.verbose || false,
    };

    // Intentar usar Anthropic API si está disponible
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
        this.useAnthropicAPI = true;
        if (this.options.verbose) {
          console.log('[ClaudeCodeClient] Using Anthropic API (more reliable)');
        }
      } catch (error) {
        console.warn('[ClaudeCodeClient] Failed to initialize Anthropic API, falling back to CLI');
        this.useAnthropicAPI = false;
      }
    } else {
      if (this.options.verbose) {
        console.log('[ClaudeCodeClient] Using Claude Code CLI (ANTHROPIC_API_KEY not set)');
      }
    }
  }

  /**
   * Encuentra el ejecutable de Claude Code CLI en el sistema
   * Portado de test-generator.js líneas 315-331
   */
  private findClaudePath(): string {
    if (this.claudePath) {
      return this.claudePath;
    }

    const possiblePaths = [
      join(process.env.HOME || '', '.claude', 'local', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      join(process.env.HOME || '', '.local', 'bin', 'claude'),
      join(process.env.HOME || '', 'bin', 'claude'),
    ];

    // Agregar rutas del PATH
    if (process.env.PATH) {
      const pathDirs = process.env.PATH.split(':');
      pathDirs.forEach(dir => {
        possiblePaths.push(join(dir, 'claude'));
      });
    }

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.claudePath = path;
        if (this.options.verbose) {
          console.log(`[ClaudeCodeClient] Found Claude CLI at: ${path}`);
        }
        return path;
      }
    }

    // Fallback: intentar usar 'claude' directamente (puede estar en PATH)
    this.claudePath = 'claude';
    if (this.options.verbose) {
      console.log(`[ClaudeCodeClient] Using fallback: 'claude' command from PATH`);
    }
    return 'claude';
  }

  /**
   * Ejecuta un comando del sistema
   * Portado de test-generator.js líneas 296-313
   */
  private executeCommand(
    command: string,
    args: string[],
    options: { cwd?: string } = {}
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const spawnOptions: any = {
        cwd: options.cwd || process.cwd(),
        shell: true,
        // Redirigir stdin desde /dev/null para evitar esperar input interactivo
        stdio: ['ignore', 'pipe', 'pipe'],
      };

      const child = spawn(command, args, spawnOptions);

      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
          if (this.options.verbose) {
            process.stdout.write(data);
          }
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
          if (this.options.verbose) {
            process.stderr.write(data);
          }
        });
      }

      child.on('error', (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`));
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      // Timeout
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000); // Force kill después de 5s
        reject(new Error(`Command timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);

      // Limpiar timeout al completar
      child.on('close', () => clearTimeout(timer));
    });
  }

  /**
   * Ejecuta Claude usando Anthropic API
   */
  private async executeWithAnthropicAPI(prompt: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic API not initialized');
    }

    if (this.options.verbose) {
      console.log(`[ClaudeCodeClient] Calling Anthropic API...`);
    }

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    });

    const textContent = message.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Anthropic API response');
    }

    return textContent.text;
  }

  /**
   * Ejecuta Claude Code CLI con un prompt
   * Portado de test-generator.js líneas 333-409
   */
  private async executeClaudeCode(prompt: string): Promise<string> {
    // Escribir prompt a archivo temporal
    const tmpFile = join(tmpdir(), `claude-prompt-${Date.now()}.txt`);

    try {
      writeFileSync(tmpFile, prompt, 'utf-8');

      if (this.options.verbose) {
        console.log(`[ClaudeCodeClient] Wrote prompt to: ${tmpFile}`);
        console.log(`[ClaudeCodeClient] Prompt length: ${prompt.length} chars`);
      }

      // Encontrar ejecutable de Claude
      const claudePath = this.findClaudePath();

      // Ejecutar Claude Code con el prompt
      if (this.options.verbose) {
        console.log(`[ClaudeCodeClient] Executing: ${claudePath} -p @${tmpFile} --dangerously-skip-permissions`);
      }

      const result = await this.executeCommand(
        claudePath,
        ['-p', `@${tmpFile}`, '--dangerously-skip-permissions'],
        {}
      );

      if (result.code !== 0) {
        throw new Error(`Claude Code failed with code ${result.code}: ${result.stderr}`);
      }

      return result.stdout;

    } finally {
      // Limpiar archivo temporal
      try {
        if (existsSync(tmpFile)) {
          unlinkSync(tmpFile);
        }
      } catch (err) {
        // Ignorar errores al limpiar
      }
    }
  }

  /**
   * Genera una conversación de usuario simulado
   */
  async generateConversation(prompt: string): Promise<string> {
    if (this.options.verbose) {
      console.log('[ClaudeCodeClient] Generating conversation...');
    }

    // Usar Anthropic API si está disponible, sino Claude Code CLI
    const output = this.useAnthropicAPI
      ? await this.executeWithAnthropicAPI(prompt)
      : await this.executeClaudeCode(prompt);

    // Intentar parsear como JSON primero
    try {
      const jsonResponse = JSON.parse(output);
      if (jsonResponse.messages && Array.isArray(jsonResponse.messages)) {
        // Convertir array de mensajes a formato numerado
        const numberedMessages = jsonResponse.messages
          .map((msg: string, idx: number) => `${idx + 1}. ${msg}`)
          .join('\n');

        if (this.options.verbose) {
          console.log(`[ClaudeCodeClient] Generated ${jsonResponse.messages.length} messages (JSON format)`);
        }

        return numberedMessages;
      }
    } catch (e) {
      // No es JSON válido, continuar con el texto plano
    }

    if (this.options.verbose) {
      console.log(`[ClaudeCodeClient] Generated ${output.length} characters (text format)`);
    }

    return output;
  }

  /**
   * Evalúa un criterio contra una conversación
   */
  async evaluateCriterion(
    conversationText: string,
    evaluationPrompt: string
  ): Promise<EvaluationResult> {
    if (this.options.verbose) {
      console.log('[ClaudeCodeClient] Evaluating criterion...');
    }

    // Combinar conversación y prompt de evaluación
    const fullPrompt = `${evaluationPrompt}\n\n${conversationText}`;

    // Usar Anthropic API si está disponible, sino Claude Code CLI
    const output = this.useAnthropicAPI
      ? await this.executeWithAnthropicAPI(fullPrompt)
      : await this.executeClaudeCode(fullPrompt);

    // Parsear resultado
    // Esperamos formato: RESULT: pass|fail\nREASONING: ...
    const resultMatch = output.match(/RESULT:\s*(pass|fail)/i);
    const reasoningMatch = output.match(/REASONING:\s*(.+)/i);

    if (!resultMatch) {
      console.warn('[ClaudeCodeClient] Could not parse evaluation result, defaulting to fail');
      return {
        passed: false,
        reasoning: 'Failed to parse evaluation result from Claude Code',
      };
    }

    return {
      passed: resultMatch[1].toLowerCase() === 'pass',
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided',
    };
  }

  /**
   * Evalúa múltiples criterios en paralelo
   */
  async evaluateMultipleCriteria(
    conversationText: string,
    evaluationPrompts: { id: string; prompt: string }[]
  ): Promise<Record<string, EvaluationResult>> {
    if (this.options.verbose) {
      console.log(`[ClaudeCodeClient] Evaluating ${evaluationPrompts.length} criteria...`);
    }

    const results: Record<string, EvaluationResult> = {};

    // Evaluar en secuencia (Claude Code CLI no soporta paralelismo real)
    for (const { id, prompt } of evaluationPrompts) {
      if (this.options.verbose) {
        console.log(`[ClaudeCodeClient] Evaluating criterion: ${id}`);
      }

      results[id] = await this.evaluateCriterion(conversationText, prompt);
    }

    return results;
  }
}
