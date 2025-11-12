#!/usr/bin/env node

/**
 * Script para usar DENTRO de Claude Code
 *
 * Este script debe ser ejecutado desde una sesión de Claude Code.
 * Le indica a Claude Code que genere los tests directamente sin
 * intentar ejecutar un comando externo.
 */

import { readFileSync } from 'fs';
import { config } from 'dotenv';
import chalk from 'chalk';

config();

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

if (!AGENT_ID) {
  console.error(chalk.red('❌ Error: ELEVENLABS_AGENT_ID no encontrada en .env'));
  process.exit(1);
}

const agentJsonPath = `./agents/${AGENT_ID}.json`;
const agentMdPath = `./agents/${AGENT_ID}.md`;
const templatePath = './tests/template.yaml';

console.log(chalk.blue.bold('\n🤖 Generación de test cases con Claude Code\n'));
console.log(chalk.cyan('Este script debe ejecutarse desde una sesión de Claude Code.'));
console.log(chalk.cyan('Si estás viendo este mensaje, copia y pega el siguiente prompt:\n'));
console.log(chalk.gray('─'.repeat(80)));

const prompt = `
Analiza la configuración completa del agente de ElevenLabs y genera TODOS los test cases necesarios para garantizar una cobertura completa.

Archivos de contexto:
- Configuración del agente: @${agentJsonPath}
- Prompt del agente: @${agentMdPath}
- Plantilla de referencia: @${templatePath}

INSTRUCCIONES:

1. Analiza cuidadosamente la configuración del agente y su prompt para entender:
   - Todas las funcionalidades del agente
   - Flujos conversacionales posibles
   - Variables dinámicas disponibles
   - Condiciones de éxito y falla
   - Reglas críticas de validación

2. Genera test cases YAML siguiendo EXACTAMENTE la estructura de template.yaml que cubran:
   - TODOS los happy paths identificables
   - TODOS los edge cases relevantes
   - Manejo de errores y validaciones
   - Casos de interrupción del usuario
   - Validación de datos con valores "No aplica"
   - Agendamiento de callbacks (con validación de horarios)

3. Cada test debe:
   - Tener un nombre descriptivo único
   - Usar el formato de simulación directa (evaluation_criteria)
   - Incluir simulated_user con prompt (string simple), first_message y language: "es"
   - Definir criterios de evaluación claros y verificables
   - Usar el agent_id: "\${ELEVENLABS_AGENT_ID}"
   - Usar new_turns_limit: 25 para mantener tests eficientes

4. IMPORTANTE para este agente específico:
   - El agente NUNCA debe mencionar datos faltantes o "no disponibles"
   - Usa variables dinámicas para simular datos del contexto
   - Considera el flujo de 2 insistencias máximas antes de cierre
   - Valida el comportamiento con valores "No aplica"
   - Tests de agendamiento deben validar lunes-viernes 8:00-12:30 y 14:00-17:30

5. Categorías de tests a generar (mínimo 15-20 tests):
   - happy-path-*.yaml: Validación exitosa completa con todos los datos
   - happy-path-skip-*.yaml: Validación exitosa omitiendo datos "No aplica"
   - edge-case-insistencias-*.yaml: Casos con 1-2 insistencias
   - edge-case-interrupciones-*.yaml: Usuario interrumpe o cambia de tema
   - error-intentos-excedidos-*.yaml: Usuario no proporciona datos tras 2 insistencias
   - validation-datos-*.yaml: Validación de cada tipo de dato (cédula, nombre, etc)
   - callback-*.yaml: Agendamiento con diferentes escenarios (válidos/inválidos)

6. Guarda cada test como archivo YAML separado en ./tests/scenarios/ con nombres descriptivos.

7. NO limites la cantidad de tests - genera TODOS los necesarios para cobertura completa del agente.

FORMATO YAML:
- El campo simulated_user.prompt debe ser un STRING simple (puede ser multilinea con |)
- NO uses evaluation_criteria Y success_examples en el mismo test
- Usa solo evaluation_criteria para tests de simulación
- Cada test debe incluir dynamic_variables apropiadas según el escenario

Genera los archivos YAML ahora en ./tests/scenarios/
`.trim();

console.log(chalk.white(prompt));
console.log(chalk.gray('─'.repeat(80)));
console.log();
console.log(chalk.yellow('📋 Copia el prompt de arriba y ejecútalo en esta sesión de Claude Code'));
console.log(chalk.yellow('   Claude Code generará automáticamente los archivos YAML\n'));
