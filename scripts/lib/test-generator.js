#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { config } from 'dotenv';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
config();

/**
 * Secure Test Generator Class
 * Addresses security vulnerabilities identified in code review:
 * - Input validation to prevent command injection and path traversal
 * - Safe command execution using spawn with array arguments
 * - Backup mechanism before file deletion
 * - Async/await for better error handling
 */
export class TestGenerator {
  constructor(mode = 'base') {
    this.mode = mode; // 'base' or 'qa'

    // Determinar provider desde env o default
    this.provider = (process.env.TEST_PROVIDER || 'elevenlabs').toLowerCase();
    if (this.provider !== 'elevenlabs' && this.provider !== 'vapi') {
      throw new Error(`Provider inválido: ${this.provider}. Usa 'elevenlabs' o 'vapi'`);
    }

    // Obtener agent ID según provider
    this.agentId = this.getAgentIdForProvider();

    this.scenariosDir = './tests/scenarios';
    this.agentsDir = './agents';
    this.backupDir = './tests/scenarios-backup';
  }

  /**
   * Gets agent ID based on provider
   * @returns {string} Agent ID
   * @throws {Error} If agent ID not found
   */
  getAgentIdForProvider() {
    let agentId;
    if (this.provider === 'vapi') {
      agentId = process.env.VAPI_ASSISTANT_ID;
      if (!agentId) {
        throw new Error('VAPI_ASSISTANT_ID no encontrada en .env');
      }
    } else {
      agentId = process.env.ELEVENLABS_AGENT_ID;
      if (!agentId) {
        throw new Error('ELEVENLABS_AGENT_ID no encontrada en .env');
      }
    }

    return this.validateAgentId(agentId);
  }

  /**
   * Validates agent ID to prevent path traversal and command injection
   * @param {string} agentId - Agent ID from environment
   * @returns {string} Validated agent ID
   * @throws {Error} If validation fails
   */
  validateAgentId(agentId) {
    if (!agentId) {
      throw new Error('ELEVENLABS_AGENT_ID no encontrada en .env');
    }

    // Whitelist validation: alphanumeric, underscore, hyphen only, max 100 chars
    const agentIdRegex = /^[a-zA-Z0-9_-]{1,100}$/;
    if (!agentIdRegex.test(agentId)) {
      throw new Error(
        `ELEVENLABS_AGENT_ID inválido: "${agentId}". ` +
        'Solo se permiten letras, números, guiones y guiones bajos (máx 100 caracteres)'
      );
    }

    return agentId;
  }

  /**
   * Validates file path to prevent directory traversal
   * @param {string} filePath - Path to validate
   * @returns {string} Validated path
   * @throws {Error} If path is unsafe
   */
  validatePath(filePath) {
    // Check for directory traversal patterns
    if (
      filePath.includes('..') ||
      filePath.startsWith('/') ||
      /^[A-Za-z]:/.test(filePath)
    ) {
      throw new Error(`Ruta insegura detectada: ${filePath}`);
    }
    return filePath;
  }

  /**
   * Gets agent file paths with validation
   * @returns {object} Validated paths
   */
  getAgentPaths() {
    const jsonPath = this.validatePath(`${this.agentsDir}/${this.agentId}.json`);
    const mdPath = this.validatePath(`${this.agentsDir}/${this.agentId}.md`);

    return {
      json: jsonPath,
      md: mdPath
    };
  }

  /**
   * Checks if agent files exist, downloads if missing
   * @returns {Promise<boolean>} True if files exist/downloaded successfully
   */
  async ensureAgentFiles() {
    const paths = this.getAgentPaths();

    if (!existsSync(paths.json) || !existsSync(paths.md)) {
      console.log(chalk.yellow(`⚠️  Archivos del ${this.provider} ${this.provider === 'vapi' ? 'assistant' : 'agente'} no encontrados. Descargando configuración...`));

      try {
        // Pasar provider al comando download
        await this.executeCommand('npm', ['run', 'download', '--', '--provider', this.provider], { stdio: 'inherit' });
      } catch (error) {
        console.error(chalk.red('\n❌ Error descargando configuración del agente'));
        throw error;
      }

      // Verify files were created
      if (!existsSync(paths.json) || !existsSync(paths.md)) {
        throw new Error('No se pudieron descargar los archivos del agente');
      }
    }

    return true;
  }

  /**
   * Creates backup of existing test files
   * @returns {Promise<number>} Number of files backed up
   */
  async backupExistingTests() {
    if (!existsSync(this.scenariosDir)) {
      return 0;
    }

    const files = readdirSync(this.scenariosDir).filter(
      f => f.endsWith('.yaml') || f.endsWith('.yml')
    );

    if (files.length === 0) {
      return 0;
    }

    // Create backup directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = `${this.backupDir}-${timestamp}`;

    // Create backup directory
    await this.executeCommand('mkdir', ['-p', backupPath]);

    // Move files to backup
    for (const file of files) {
      const sourcePath = this.validatePath(join(this.scenariosDir, file));
      const destPath = this.validatePath(join(backupPath, file));
      renameSync(sourcePath, destPath);
    }

    console.log(chalk.gray(`   Backup creado: ${backupPath} (${files.length} archivos)`));
    return files.length;
  }

  /**
   * Cleans existing test files with backup
   * @returns {Promise<number>} Number of files cleaned
   */
  async cleanExistingTests() {
    console.log(chalk.cyan('🗑️  Limpiando tests existentes...'));

    const backedUp = await this.backupExistingTests();

    if (backedUp > 0) {
      console.log(chalk.gray(`   Eliminados ${backedUp} archivos (backup creado)`));
    } else {
      console.log(chalk.gray('   No hay archivos para limpiar'));
    }

    return backedUp;
  }

  /**
   * Loads optimized prompt from file
   * @returns {string} Prompt content
   */
  loadOptimizedPrompt() {
    const promptFileName = this.mode === 'qa'
      ? 'optimized-qa-expert.md'
      : 'optimized-base-claude.md';

    const promptPath = this.validatePath(`./prompts/${promptFileName}`);

    if (!existsSync(promptPath)) {
      throw new Error(
        `Prompt optimizado no encontrado: ${promptPath}\n` +
        'Ejecuta el prompt-engineer para generar los prompts optimizados.'
      );
    }

    let promptTemplate = readFileSync(promptPath, 'utf-8');

    // Replace path placeholders
    const paths = this.getAgentPaths();
    promptTemplate = promptTemplate
      .replace(/\$\{agentJsonPath\}/g, paths.json)
      .replace(/\$\{agentMdPath\}/g, paths.md);

    // Replace template reference based on provider
    const templateFile = this.provider === 'vapi' ? 'template-vapi.yaml' : 'template.yaml';
    promptTemplate = promptTemplate.replace(
      /@\.\/tests\/template\.yaml/g,
      `@./tests/${templateFile}`
    );

    // Add provider context to the prompt
    if (this.provider === 'vapi') {
      promptTemplate = `# IMPORTANT: Generate tests for VAPI provider\n` +
        `Use the Vapi-specific template structure with provider: vapi field.\n\n` +
        promptTemplate;
    }

    return promptTemplate;
  }

  /**
   * Executes a command safely using spawn
   * @param {string} command - Command to execute
   * @param {string[]} args - Command arguments
   * @param {object} options - Spawn options
   * @returns {Promise<void>}
   */
  executeCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      // Use shell: true only for commands that need PATH resolution
      // but still safe because we validate all inputs
      const child = spawn(command, args, {
        ...options,
        shell: true // Required for PATH resolution, but inputs are validated
      });

      if (options.stdio !== 'inherit') {
        let stdout = '';
        let stderr = '';

        if (child.stdout) {
          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });
        }

        if (child.stderr) {
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`Command failed with code ${code}: ${stderr}`));
          }
        });
      } else {
        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Command failed with code ${code}`));
          }
        });
      }

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Checks if Claude Code CLI is installed
   * @returns {Promise<boolean>}
   */
  async checkClaudeCLI() {
    try {
      await this.executeCommand('which', ['claude']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Finds the Claude CLI executable path
   * @returns {string} Path to claude executable
   */
  findClaudePath() {
    // Common installation paths
    const possiblePaths = [
      join(homedir(), '.claude', 'local', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      'claude' // Fallback to PATH
    ];

    for (const path of possiblePaths) {
      if (path === 'claude' || existsSync(path)) {
        return path;
      }
    }

    return 'claude'; // Fallback
  }

  /**
   * Executes Claude Code with the optimized prompt
   * @returns {Promise<void>}
   */
  async executeClaudeCode() {
    const prompt = this.loadOptimizedPrompt();

    console.log(chalk.cyan('\n🚀 Ejecutando Claude Code...\n'));
    console.log(chalk.gray(`   Provider: ${this.provider}`));
    console.log(chalk.gray(`   Modo: ${this.mode === 'qa' ? 'QA Expert (agente especializado)' : 'Base Claude'}`));
    console.log(chalk.gray(`   ${this.provider === 'vapi' ? 'Assistant' : 'Agente'}: ${this.agentId}`));
    console.log(chalk.gray(`   Template: tests/${this.provider === 'vapi' ? 'template-vapi.yaml' : 'template.yaml'}`));

    if (this.mode === 'qa') {
      console.log(chalk.yellow('   ⚠️  Nota: Este modo consume más tokens pero genera tests de mayor calidad\n'));
    } else {
      console.log(chalk.gray('   💡 Tip: Usa "npm run generate:tests:qa" para mejor calidad\n'));
    }

    try {
      // Write prompt to temporary file to avoid shell escaping issues
      const { writeFileSync, unlinkSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');

      const tmpFile = join(tmpdir(), `claude-prompt-${Date.now()}.txt`);
      writeFileSync(tmpFile, prompt, 'utf-8');

      // Find Claude CLI path (handles aliases and custom installations)
      const claudePath = this.findClaudePath();

      try {
        // Execute Claude Code with prompt file
        await this.executeCommand(claudePath, ['-p', `@${tmpFile}`, '--dangerously-skip-permissions'], { stdio: 'inherit' });
      } finally {
        // Clean up temp file
        try {
          unlinkSync(tmpFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      // Enhanced error detection
      const isCLINotFound = error.code === 'ENOENT' || error.message.includes('spawn claude ENOENT');

      if (isCLINotFound) {
        console.error(chalk.red('\n❌ Claude Code CLI no está instalado\n'));
        console.error(chalk.yellow('🔧 SOLUCIÓN RÁPIDA:\n'));
        console.error(chalk.cyan('   1. Instalar Claude Code CLI:'));
        console.error(chalk.white('      npm install -g @anthropic-ai/claude-code\n'));
        console.error(chalk.cyan('   2. Autenticar con tu cuenta de Anthropic:'));
        console.error(chalk.white('      claude auth login\n'));
        console.error(chalk.cyan('   3. Verificar que funciona:'));
        console.error(chalk.white('      claude --version\n'));
        console.error(chalk.cyan('   4. Ejecutar nuevamente:'));
        console.error(chalk.white('      npm run generate:tests\n'));
        console.error(chalk.gray('📖 Más info: https://github.com/anthropics/claude-code\n'));
        console.error(chalk.yellow('⚠️  NOTA IMPORTANTE:'));
        console.error(chalk.gray('   Esta sesión usa Claude Code Desktop (interfaz), pero los scripts'));
        console.error(chalk.gray('   necesitan Claude Code CLI (comando terminal) para funcionar.\n'));
      } else {
        console.error(chalk.red('\n❌ Error ejecutando Claude Code'));
        console.error(chalk.yellow('\n💡 Verifica que:'));
        console.error(chalk.yellow('   1. Claude Code CLI esté autenticado: claude auth login'));

        if (this.mode === 'qa') {
          console.error(chalk.yellow('   2. Tengas el agente qa-expert configurado'));
        }

        console.error(chalk.yellow('   3. Tengas permisos para editar archivos'));
        console.error(chalk.gray(`\n   Error original: ${error.message}\n`));
      }

      throw error;
    }
  }

  /**
   * Counts generated test files
   * @returns {object} Test file statistics
   */
  countGeneratedTests() {
    if (!existsSync(this.scenariosDir)) {
      return { total: 0, files: [] };
    }

    const files = readdirSync(this.scenariosDir).filter(
      f => f.endsWith('.yaml') || f.endsWith('.yml')
    );

    // Count by category
    const categories = {
      smoke: 0,
      happy: 0,
      edge: 0,
      error: 0,
      validation: 0,
      integration: 0,
      interruption: 0,
      ambiguity: 0,
      regression: 0,
      other: 0
    };

    files.forEach(file => {
      const categoryMatch = file.match(/^(p\d+-)?(smoke|happy|edge|error|validation|integration|interruption|ambiguity|regression)-/);
      if (categoryMatch) {
        const category = categoryMatch[2];
        categories[category]++;
      } else {
        categories.other++;
      }
    });

    return {
      total: files.length,
      files: files.sort(),
      categories
    };
  }

  /**
   * Displays generation results
   * @param {object} stats - Test statistics
   */
  displayResults(stats) {
    console.log(chalk.green.bold('\n✅ Generación completada!'));
    console.log(chalk.cyan(`\n📊 Tests generados: ${stats.total}`));

    // Display categories if QA mode
    if (this.mode === 'qa' && stats.total > 0) {
      console.log(chalk.gray('\nCobertura por categoría:'));
      Object.entries(stats.categories).forEach(([category, count]) => {
        if (count > 0) {
          console.log(chalk.gray(`  - ${category}: ${count}`));
        }
      });
    }

    console.log(chalk.gray('\nArchivos creados:'));
    stats.files.forEach(file => {
      console.log(chalk.gray(`  - ${file}`));
    });
    console.log();
  }

  /**
   * Main execution flow
   * @returns {Promise<void>}
   */
  async generate() {
    try {
      console.log(chalk.blue.bold(
        `\n🤖 Generando test cases para ${this.provider.toUpperCase()} con Claude Code (${this.mode === 'qa' ? 'QA Expert' : 'base'})...\n`
      ));

      // Step 1: Ensure agent files exist
      await this.ensureAgentFiles();

      // Step 2: Clean existing tests (with backup)
      await this.cleanExistingTests();

      // Step 3: Execute Claude Code
      await this.executeClaudeCode();

      // Step 4: Count and display results
      const stats = this.countGeneratedTests();
      this.displayResults(stats);

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  }
}
