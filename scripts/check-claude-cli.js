#!/usr/bin/env node

/**
 * Claude Code CLI Installation Checker
 *
 * Verifica que Claude Code CLI esté correctamente instalado y configurado
 * para que los scripts de generación de tests funcionen.
 */

import { spawn } from 'child_process';
import chalk from 'chalk';

console.log(chalk.blue.bold('\n🔍 Verificando instalación de Claude Code CLI...\n'));

const checks = [
  {
    name: 'Verificando si "claude" está en PATH',
    command: 'which',
    args: ['claude'],
    successMsg: 'Claude CLI encontrado',
    failureMsg: 'Claude CLI no encontrado en PATH',
    required: true
  },
  {
    name: 'Verificando versión de Claude CLI',
    command: 'claude',
    args: ['--version'],
    successMsg: 'Versión de Claude CLI detectada',
    failureMsg: 'No se pudo obtener versión',
    required: true
  },
  {
    name: 'Verificando instalación global de @anthropic-ai/claude-code',
    command: 'npm',
    args: ['list', '-g', '@anthropic-ai/claude-code', '--depth=0'],
    successMsg: 'Paquete instalado globalmente',
    failureMsg: 'Paquete no instalado globalmente',
    required: false
  }
];

async function runCheck(check) {
  return new Promise((resolve) => {
    const process = spawn(check.command, check.args, {
      shell: false,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    if (process.stdout) {
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (process.stderr) {
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    process.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout || stderr,
        code
      });
    });

    process.on('error', (error) => {
      resolve({
        success: false,
        output: error.message,
        code: -1
      });
    });
  });
}

async function main() {
  let allPassed = true;
  const results = [];

  for (const check of checks) {
    console.log(chalk.gray(`\n⏳ ${check.name}...`));
    const result = await runCheck(check);

    if (result.success) {
      console.log(chalk.green(`✅ ${check.successMsg}`));
      if (result.output.trim()) {
        console.log(chalk.gray(`   ${result.output.trim().split('\n')[0]}`));
      }
      results.push({ check: check.name, passed: true });
    } else {
      const severity = check.required ? chalk.red : chalk.yellow;
      const icon = check.required ? '❌' : '⚠️';
      console.log(severity(`${icon} ${check.failureMsg}`));
      if (result.output.trim()) {
        console.log(chalk.gray(`   ${result.output.trim()}`));
      }
      results.push({ check: check.name, passed: false, required: check.required });
      if (check.required) {
        allPassed = false;
      }
    }
  }

  console.log(chalk.blue('\n' + '='.repeat(60) + '\n'));

  if (allPassed) {
    console.log(chalk.green.bold('✅ TODO LISTO! Claude Code CLI está correctamente instalado\n'));
    console.log(chalk.cyan('Puedes ejecutar:'));
    console.log(chalk.white('  npm run generate:tests\n'));
    console.log(chalk.gray('o para mejor calidad:'));
    console.log(chalk.white('  npm run generate:tests:qa\n'));
    process.exit(0);
  } else {
    console.log(chalk.red.bold('❌ CONFIGURACIÓN INCOMPLETA\n'));
    console.log(chalk.yellow('🔧 PASOS PARA SOLUCIONAR:\n'));

    const failedRequired = results.filter(r => !r.passed && r.required);

    if (failedRequired.length > 0) {
      console.log(chalk.cyan('1. Instalar Claude Code CLI:'));
      console.log(chalk.white('   npm install -g @anthropic-ai/claude-code\n'));

      console.log(chalk.cyan('2. Autenticar con tu cuenta de Anthropic:'));
      console.log(chalk.white('   claude auth login\n'));

      console.log(chalk.cyan('3. Verificar instalación:'));
      console.log(chalk.white('   claude --version\n'));

      console.log(chalk.cyan('4. Ejecutar este script nuevamente:'));
      console.log(chalk.white('   node scripts/check-claude-cli.js\n'));

      console.log(chalk.gray('📖 Más información: CLAUDE_CLI_SETUP.md\n'));
      console.log(chalk.gray('📖 Repositorio oficial: https://github.com/anthropics/claude-code\n'));
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('\n❌ Error ejecutando verificación:'));
  console.error(chalk.gray(error.message));
  process.exit(1);
});
