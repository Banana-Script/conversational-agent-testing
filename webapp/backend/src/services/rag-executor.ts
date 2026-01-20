/**
 * RAG Executor Service
 * Handles RAG preprocessing using Ralph iterative mode
 * Extracts structured information from documents into a knowledge base
 */

import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, rm, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import type { Job, RagFile, ContextFile } from '../types/index.js';
import { broadcastToJob } from '../middleware/sse.js';
import { convertFile, needsConversion, isNativeClaudeFormat } from './file-converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const SHARED_DIR = join(__dirname, '../../shared');
const RAG_TEMPLATES_DIR = join(SHARED_DIR, 'ralph-templates-rag');

// RAG-specific configuration (more iterations for thoroughness)
const RAG_MAX_ITERATIONS = 8;
const RAG_ITERATION_TIMEOUT = 10 * 60 * 1000;  // 10 minutes per iteration
const RAG_TOTAL_TIMEOUT = 45 * 60 * 1000;       // 45 minutes total

/**
 * Sanitizes a filename to prevent path traversal attacks
 */
function sanitizeFilename(filename: string): string {
  let safe = basename(filename);
  safe = safe.replace(/[\x00-\x1f]/g, '');
  safe = safe.replace(/\.\./g, '');
  if (!safe || safe === '.' || safe === '..') {
    safe = 'file.txt';
  }
  return safe;
}

/**
 * Validates if a string is valid base64
 */
function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;

  // Check for valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) return false;

  // Try to decode and re-encode to verify
  try {
    const decoded = Buffer.from(str, 'base64');
    // If the decoded buffer is empty for non-empty input, it's invalid
    if (decoded.length === 0 && str.length > 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses RALPH_STATUS block from output
 */
function parseRalphStatus(output: string): {
  status: 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED';
  tasksCompletedThisLoop: number;
  filesModified: number;
  workType: string;
  exitSignal: boolean;
  recommendation: string;
} | null {
  const statusMatch = output.match(/---RALPH_STATUS---\s*([\s\S]*?)\s*---END_RALPH_STATUS---/);
  if (!statusMatch) {
    return null;
  }

  const statusBlock = statusMatch[1];
  const getField = (field: string): string => {
    const match = statusBlock.match(new RegExp(`${field}:\\s*(.+)`, 'i'));
    return match ? match[1].trim() : '';
  };

  return {
    status: (getField('STATUS') || 'IN_PROGRESS') as 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED',
    tasksCompletedThisLoop: parseInt(getField('TASKS_COMPLETED_THIS_LOOP')) || 0,
    filesModified: parseInt(getField('FILES_MODIFIED')) || 0,
    workType: getField('WORK_TYPE') || 'EXTRACTION',
    exitSignal: getField('EXIT_SIGNAL').toLowerCase() === 'true',
    recommendation: getField('RECOMMENDATION'),
  };
}

export class RagExecutor {
  /**
   * Sets up RAG workspace with templates and source documents
   */
  async setupRagWorkspace(
    jobId: string,
    contextFiles: ContextFile[]
  ): Promise<string> {
    const workspaceDir = join(tmpdir(), 'rag-workspaces', jobId);
    const docsDir = join(workspaceDir, 'docs');
    const outputDir = join(workspaceDir, 'output');

    // Create directories
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(docsDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    // Copy RAG templates
    const templateFiles = ['PROMPT.md', '@fix_plan.md', '@AGENT.md'];
    for (const templateFile of templateFiles) {
      const srcPath = join(RAG_TEMPLATES_DIR, templateFile);
      const destPath = join(workspaceDir, templateFile);

      if (existsSync(srcPath)) {
        const content = await readFile(srcPath, 'utf-8');
        await writeFile(destPath, content, 'utf-8');
      }
    }

    // Process and copy user files to docs/
    for (const file of contextFiles) {
      const safeName = sanitizeFilename(file.name);

      // Check if file needs conversion
      if (needsConversion(safeName)) {
        // Validate base64 content
        if (!isValidBase64(file.content)) {
          broadcastToJob(jobId, {
            type: 'progress',
            message: `Advertencia: ${safeName} tiene contenido base64 inválido. Omitido.`,
            timestamp: new Date().toISOString(),
          });
          continue;
        }
        // Convert Excel/Word to markdown
        const buffer = Buffer.from(file.content, 'base64');
        const result = await convertFile(buffer, safeName);

        if (result) {
          // Save converted markdown
          const mdName = safeName.replace(/\.[^.]+$/, '.md');
          const filePath = join(docsDir, mdName);
          await writeFile(filePath, result.content, 'utf-8');

          broadcastToJob(jobId, {
            type: 'progress',
            message: `Convertido: ${safeName} -> ${mdName}`,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Report conversion failure to user
          broadcastToJob(jobId, {
            type: 'progress',
            message: `Advertencia: No se pudo convertir ${safeName}. El archivo será omitido.`,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (isNativeClaudeFormat(safeName)) {
        // Check if content is base64 (binary files) or text
        const ext = safeName.toLowerCase().substring(safeName.lastIndexOf('.'));
        const binaryExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];

        if (binaryExtensions.includes(ext)) {
          // Validate base64 content for binary files
          if (!isValidBase64(file.content)) {
            broadcastToJob(jobId, {
              type: 'progress',
              message: `Advertencia: ${safeName} tiene contenido base64 inválido. Omitido.`,
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          // Binary file - decode base64 and save
          const buffer = Buffer.from(file.content, 'base64');
          const filePath = join(docsDir, safeName);
          await writeFile(filePath, buffer);
        } else {
          // Text file - save as-is
          const filePath = join(docsDir, safeName);
          await writeFile(filePath, file.content, 'utf-8');
        }
      }
    }

    // Initialize git repo (required by Ralph/Claude Code)
    const { execSync } = await import('child_process');
    try {
      execSync('git init', { cwd: workspaceDir, stdio: 'ignore' });
      execSync('git add -A', { cwd: workspaceDir, stdio: 'ignore' });
      execSync('git commit -m "Initial RAG workspace setup" --allow-empty', {
        cwd: workspaceDir,
        stdio: 'ignore',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Ralph',
          GIT_AUTHOR_EMAIL: 'ralph@rag.local',
          GIT_COMMITTER_NAME: 'Ralph',
          GIT_COMMITTER_EMAIL: 'ralph@rag.local'
        }
      });
    } catch (error) {
      console.warn(`[RagExecutor] Git init failed (non-critical): ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return workspaceDir;
  }

  /**
   * Finds the Claude CLI path
   */
  private findClaudePath(): string {
    const possiblePaths = [
      join(process.env.HOME || '', '.claude', 'local', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      'claude',
    ];

    for (const path of possiblePaths) {
      if (path === 'claude' || existsSync(path)) {
        return path;
      }
    }

    return 'claude';
  }

  /**
   * Executes a single Ralph iteration for RAG preprocessing
   */
  private runRagIteration(workspaceDir: string, jobId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const claudePath = this.findClaudePath();

      const args = [
        '-p',
        '@PROMPT.md',
        '--dangerously-skip-permissions',
        '--output-format', 'text',  // Explicit text output
      ];

      const hasToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
      const tokenPreview = hasToken
        ? `${process.env.CLAUDE_CODE_OAUTH_TOKEN!.substring(0, 10)}...`
        : 'NOT SET';

      console.log(`[RAG][${jobId}] ========== STARTING ITERATION ==========`);
      console.log(`[RAG][${jobId}] Claude path: ${claudePath}`);
      console.log(`[RAG][${jobId}] Working dir: ${workspaceDir}`);
      console.log(`[RAG][${jobId}] Token present: ${hasToken ? 'YES' : 'NO'} (preview: ${tokenPreview})`);
      console.log(`[RAG][${jobId}] Command: ${claudePath} ${args.join(' ')}`);

      let stdout = '';
      let stderr = '';
      let outputReceived = false;
      let stdoutBytes = 0;
      let stderrBytes = 0;

      const child = spawn(claudePath, args, {
        cwd: workspaceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
          // Force non-interactive mode
          CI: 'true',
          TERM: 'dumb',
          // Force unbuffered output
          PYTHONUNBUFFERED: '1',
          NODE_NO_WARNINGS: '1',
        },
      });

      console.log(`[RAG][${jobId}] Process spawned with PID: ${child.pid}`);

      child.stdout.on('data', (data) => {
        outputReceived = true;
        const chunk = data.toString();
        stdout += chunk;
        stdoutBytes += data.length;
        // Log each line to console in real-time
        const lines = chunk.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          console.log(`[RAG][${jobId}][stdout] ${line}`);
        }
        // Also log raw byte count periodically
        if (stdoutBytes % 10000 < data.length) {
          console.log(`[RAG][${jobId}] Received ${stdoutBytes} bytes from stdout so far`);
        }
      });

      child.stderr.on('data', (data) => {
        outputReceived = true;
        const chunk = data.toString();
        stderr += chunk;
        stderrBytes += data.length;
        // Log stderr lines
        const lines = chunk.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          console.log(`[RAG][${jobId}][stderr] ${line}`);
        }
      });

      const startTime = Date.now();

      // Heartbeat every 15 seconds with detailed status
      const heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[RAG][${jobId}] [HEARTBEAT] pid=${child.pid} elapsed=${elapsed}s stdout=${stdoutBytes}b stderr=${stderrBytes}b output=${outputReceived ? 'YES' : 'NO'}`);
      }, 15000);

      const timeout = setTimeout(() => {
        clearInterval(heartbeat);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[RAG][${jobId}] ========== TIMEOUT ==========`);
        console.log(`[RAG][${jobId}] Process timed out after ${elapsed}s`);
        console.log(`[RAG][${jobId}] Total stdout: ${stdoutBytes} bytes`);
        console.log(`[RAG][${jobId}] Total stderr: ${stderrBytes} bytes`);
        console.log(`[RAG][${jobId}] Output received: ${outputReceived ? 'YES' : 'NO'}`);
        child.kill('SIGTERM');
        reject(new Error(`RAG iteration timeout (${RAG_ITERATION_TIMEOUT / 60000} minutes)`));
      }, RAG_ITERATION_TIMEOUT);

      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[RAG][${jobId}] ========== PROCESS EXITED ==========`);
        console.log(`[RAG][${jobId}] Exit code: ${code}, Signal: ${signal}`);
        console.log(`[RAG][${jobId}] Duration: ${elapsed}s`);
        console.log(`[RAG][${jobId}] Total stdout: ${stdoutBytes} bytes`);
        console.log(`[RAG][${jobId}] Total stderr: ${stderrBytes} bytes`);

        if (stdoutBytes === 0 && stderrBytes === 0) {
          console.log(`[RAG][${jobId}] WARNING: No output captured from Claude CLI!`);
        }

        if (code === 0) {
          resolve(stdout);
        } else {
          // Even on non-zero exit, return output for status parsing
          resolve(stdout || stderr);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        console.error(`[RAG][${jobId}] ========== PROCESS ERROR ==========`);
        console.error(`[RAG][${jobId}] Error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * Recursively collects output files preserving directory structure
   */
  async collectRagOutput(workspaceDir: string): Promise<RagFile[]> {
    const outputDir = join(workspaceDir, 'output');
    const files: RagFile[] = [];

    async function collectRecursively(dir: string): Promise<void> {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            await collectRecursively(fullPath);
          } else if (entry.name.endsWith('.md')) {
            const content = await readFile(fullPath, 'utf-8');
            const relativePath = relative(outputDir, fullPath);
            files.push({ path: relativePath, content });
          }
        }
      } catch (error) {
        console.warn(`[RagExecutor] Error collecting from ${dir}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    if (existsSync(outputDir)) {
      await collectRecursively(outputDir);
    }

    return files;
  }

  /**
   * Executes RAG preprocessing using Ralph iterative mode
   */
  async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    let workspaceDir: string | null = null;

    broadcastToJob(job.id, {
      type: 'progress',
      message: 'Iniciando preprocesamiento RAG...',
      timestamp: new Date().toISOString(),
    });

    try {
      // Setup workspace
      const contextFiles = job.contextFiles || [];
      if (contextFiles.length === 0) {
        throw new Error('No se proporcionaron archivos para el preprocesamiento RAG');
      }

      workspaceDir = await this.setupRagWorkspace(job.id, contextFiles);

      broadcastToJob(job.id, {
        type: 'progress',
        message: `Workspace RAG creado con ${contextFiles.length} documentos fuente`,
        timestamp: new Date().toISOString(),
      });

      let totalFilesGenerated = 0;
      let totalTasksCompleted = 0;

      // Main iteration loop
      for (let iteration = 1; iteration <= RAG_MAX_ITERATIONS; iteration++) {
        // Check total timeout
        if (Date.now() - startTime > RAG_TOTAL_TIMEOUT) {
          broadcastToJob(job.id, {
            type: 'progress',
            message: `Timeout RAG alcanzado (${RAG_TOTAL_TIMEOUT / 60000} minutos)`,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        broadcastToJob(job.id, {
          type: 'progress',
          message: `RAG iteracion ${iteration}/${RAG_MAX_ITERATIONS}...`,
          timestamp: new Date().toISOString(),
          data: {
            iteration,
            maxIterations: RAG_MAX_ITERATIONS,
            tasksCompleted: totalTasksCompleted,
            testsGenerated: totalFilesGenerated,
            workType: 'EXTRACTION',
          },
        });

        try {
          // Run Ralph iteration
          const output = await this.runRagIteration(workspaceDir, job.id);

          // Parse status
          const status = parseRalphStatus(output);

          if (status) {
            totalTasksCompleted += status.tasksCompletedThisLoop;

            // Collect current file count
            const currentFiles = await this.collectRagOutput(workspaceDir);
            totalFilesGenerated = currentFiles.length;

            broadcastToJob(job.id, {
              type: 'progress',
              message: `RAG Iteracion ${iteration}: ${status.tasksCompletedThisLoop} tareas, ${totalFilesGenerated} archivos KB generados`,
              timestamp: new Date().toISOString(),
              data: {
                iteration,
                maxIterations: RAG_MAX_ITERATIONS,
                tasksCompleted: totalTasksCompleted,
                testsGenerated: totalFilesGenerated,
                workType: status.workType,
              },
            });

            // Check exit conditions
            if (status.exitSignal || status.status === 'COMPLETE') {
              broadcastToJob(job.id, {
                type: 'progress',
                message: `RAG completado: ${status.recommendation || 'Base de conocimiento extraida'}`,
                timestamp: new Date().toISOString(),
              });
              break;
            }

            if (status.status === 'BLOCKED') {
              broadcastToJob(job.id, {
                type: 'progress',
                message: `RAG bloqueado: ${status.recommendation || 'Se requiere intervencion manual'}`,
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } else {
            broadcastToJob(job.id, {
              type: 'progress',
              message: `RAG Iteracion ${iteration} completada (sin bloque de estado)`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (iterError) {
          const errorMsg = iterError instanceof Error ? iterError.message : 'Error desconocido';
          broadcastToJob(job.id, {
            type: 'progress',
            message: `Error en RAG iteracion ${iteration}: ${errorMsg}`,
            timestamp: new Date().toISOString(),
          });

          if (errorMsg.includes('timeout')) {
            break;
          }
        }
      }

      // Collect final output
      const ragFiles = await this.collectRagOutput(workspaceDir);

      if (ragFiles.length === 0) {
        broadcastToJob(job.id, {
          type: 'progress',
          message: 'RAG no genero archivos de conocimiento. Verificar documentos de entrada.',
          timestamp: new Date().toISOString(),
        });
      } else {
        broadcastToJob(job.id, {
          type: 'progress',
          message: `RAG completado: ${ragFiles.length} archivos de conocimiento generados`,
          timestamp: new Date().toISOString(),
        });
      }

      // Store RAG files in job
      job.ragFiles = ragFiles;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      broadcastToJob(job.id, {
        type: 'error',
        message: `Error en preprocesamiento RAG: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      });

      throw error;
    } finally {
      // Cleanup workspace
      if (workspaceDir) {
        try {
          await rm(workspaceDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}

// Singleton instance
export const ragExecutor = new RagExecutor();
