import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { parse as parseYAML } from 'yaml';
import type { Provider, Job, ContextFile, RalphStatusBlock } from '../types/index.js';
import { glob } from 'glob';
import { broadcastToJob } from '../middleware/sse.js';
import { getElevenLabsAgentConfig } from './elevenlabs-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constantes para debug output
const DEBUG_PREVIEW_MAX_CHARS = 500;

// Patrones de datos sensibles a sanitizar en debug output
const SENSITIVE_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-]+/gi,                    // Anthropic API keys
  /sk_[a-zA-Z0-9]{20,}/gi,                     // Generic sk_ keys (ElevenLabs, etc.)
  /xi-api-key[=:]\s*['"]?[a-zA-Z0-9-]+['"]?/gi, // ElevenLabs header
  /api[_-]?key[=:]\s*['"]?[a-zA-Z0-9-]+['"]?/gi,
  /password[=:]\s*['"]?[^\s'"]+['"]?/gi,
  /token[=:]\s*['"]?[a-zA-Z0-9-_.]+['"]?/gi,
  /Bearer\s+[a-zA-Z0-9-_.]+/gi,
  /[a-zA-Z0-9-_.]+@[a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}/gi, // Emails
];

/**
 * Sanitiza el output para remover posibles secrets antes de enviarlo al frontend
 */
function sanitizeDebugOutput(output: string): string {
  let sanitized = output;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

/**
 * Sanitizes a filename to prevent path traversal attacks.
 * Removes path components and dangerous characters.
 */
function sanitizeFilename(filename: string): string {
  // Extract just the filename, removing any path components
  let safe = basename(filename);
  // Remove any null bytes and control characters
  safe = safe.replace(/[\x00-\x1f]/g, '');
  // Remove path traversal sequences that might slip through
  safe = safe.replace(/\.\./g, '');
  // Default to 'file.txt' if the result is empty or just dots
  if (!safe || safe === '.' || safe === '..') {
    safe = 'file.txt';
  }
  return safe;
}

/**
 * Trunca un string de manera segura para Unicode (no corta emojis/caracteres multi-byte)
 */
function truncateUnicodeSafe(text: string, maxChars: number): { truncated: string; wasTruncated: boolean } {
  const chars = [...text];
  if (chars.length <= maxChars) {
    return { truncated: text, wasTruncated: false };
  }
  return {
    truncated: chars.slice(0, maxChars).join(''),
    wasTruncated: true,
  };
}

// Paths relativos al backend
// En desarrollo: backend/src/services -> ../../shared
// En Docker: /app/dist/services -> ../../shared (-> /app/shared)
const SHARED_DIR = join(__dirname, '../../shared');
const PROMPTS_DIR = join(SHARED_DIR, 'prompts');
const TEMPLATES_DIR = join(SHARED_DIR, 'templates');
const RALPH_TEMPLATES_DIR = join(SHARED_DIR, 'ralph-templates');

// Ralph configuration
const RALPH_MAX_ITERATIONS = 5;
const RALPH_ITERATION_TIMEOUT = 5 * 60 * 1000;  // 5 minutes per iteration
const RALPH_TOTAL_TIMEOUT = 30 * 60 * 1000;     // 30 minutes total

export class ClaudeExecutor {
  private promptTemplate: string | null = null;

  async initialize(): Promise<void> {
    const promptPath = join(PROMPTS_DIR, 'optimized-qa-expert.md');
    if (existsSync(promptPath)) {
      this.promptTemplate = await readFile(promptPath, 'utf-8');
    } else {
      throw new Error(`Prompt template not found: ${promptPath}`);
    }
  }

  /**
   * Crea directorio temporal con archivos de contexto
   * @returns path al directorio y lista de paths de archivos creados
   */
  private async createContextDirectory(
    jobId: string,
    files: ContextFile[]
  ): Promise<{ dirPath: string; filePaths: string[] }> {
    const contextDir = join(tmpdir(), `context-${jobId}`);
    await mkdir(contextDir, { recursive: true });

    const filePaths: string[] = [];
    for (const file of files) {
      const safeName = sanitizeFilename(file.name);
      const filePath = join(contextDir, safeName);
      await writeFile(filePath, file.content, 'utf-8');
      filePaths.push(filePath);
    }

    return { dirPath: contextDir, filePaths };
  }

  /**
   * Limpia directorio temporal de contexto
   */
  private async cleanupContextDirectory(dirPath: string): Promise<void> {
    try {
      await rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignorar errores de cleanup
    }
  }

  async execute(job: Job): Promise<void> {
    // Branch to Ralph iterative mode if enabled
    if (job.options?.useRalph) {
      return this.executeWithRalph(job);
    }

    if (!this.promptTemplate) {
      await this.initialize();
    }

    broadcastToJob(job.id, {
      type: 'progress',
      message: 'Iniciando generacion de tests...',
      timestamp: new Date().toISOString(),
    });

    let contextDir: string | null = null;
    let contextFilePaths: string[] = [];

    try {
      // 1. Load template for provider
      const template = await this.loadTemplate(job.provider);

      broadcastToJob(job.id, {
        type: 'progress',
        message: `Template de ${job.provider} cargado`,
        timestamp: new Date().toISOString(),
      });

      // 2. Handle context files (new) or content (deprecated)
      let userContent = '';
      if (job.contextFiles && job.contextFiles.length > 0) {
        // Crear directorio temporal con archivos de contexto
        const contextResult = await this.createContextDirectory(job.id, job.contextFiles);
        contextDir = contextResult.dirPath;
        contextFilePaths = contextResult.filePaths;

        broadcastToJob(job.id, {
          type: 'progress',
          message: `${job.contextFiles.length} archivos de contexto preparados`,
          timestamp: new Date().toISOString(),
        });

        // Para el prompt, solo mencionamos que los archivos están disponibles
        userContent = `Los siguientes archivos de contexto están disponibles:\n${job.contextFiles.map(f => `- ${f.name}`).join('\n')}`;
      } else if (job.content) {
        // Modo deprecado: contenido inline
        userContent = job.content;
      } else {
        throw new Error('No se proporcionó contenido ni archivos de contexto');
      }

      // 3. Build full prompt
      const fullPrompt = await this.buildPrompt(userContent, template, job);

      // 4. Write prompt to temp file
      const tmpFile = join(tmpdir(), `prompt-${job.id}.txt`);
      await writeFile(tmpFile, fullPrompt, 'utf-8');

      broadcastToJob(job.id, {
        type: 'progress',
        message: 'Ejecutando Claude Code CLI...',
        timestamp: new Date().toISOString(),
      });

      try {
        // 5. Execute Claude CLI with context file references
        const output = await this.runClaude(tmpFile, job.id, contextFilePaths);

        // 6. Parse YAML blocks from output
        const yamlBlocks = this.parseYAMLBlocks(output);

        // Si no hay bloques YAML pero Claude respondió algo, enviar preview para debug
        const trimmedOutput = output.trim();
        if (yamlBlocks.length === 0 && trimmedOutput.length > 0) {
          // Sanitizar secrets y truncar de manera segura para Unicode
          const sanitized = sanitizeDebugOutput(trimmedOutput);
          const { truncated, wasTruncated } = truncateUnicodeSafe(sanitized, DEBUG_PREVIEW_MAX_CHARS);
          const preview = wasTruncated
            ? `${truncated}... (${[...sanitized].length} chars total)`
            : truncated;

          broadcastToJob(job.id, {
            type: 'progress',
            message: 'Claude respondió pero no se encontraron bloques YAML válidos',
            timestamp: new Date().toISOString(),
            data: { debugInfo: preview },
          });
        }

        broadcastToJob(job.id, {
          type: 'progress',
          message: `Parseados ${yamlBlocks.length} tests del output`,
          timestamp: new Date().toISOString(),
        });

        // 7. Process each YAML
        const generatedFiles: Array<{ name: string; content: string }> = [];

        for (let i = 0; i < yamlBlocks.length; i++) {
          const yaml = yamlBlocks[i];
          const filename = this.generateFilename(yaml, i);

          generatedFiles.push({ name: filename, content: yaml });

          broadcastToJob(job.id, {
            type: 'file_created',
            message: `Archivo creado: ${filename}`,
            timestamp: new Date().toISOString(),
            data: {
              filename,
              content: yaml.substring(0, 500), // Preview
              currentFile: i + 1,
              totalFiles: yamlBlocks.length,
            },
          });
        }

        job.generatedFiles = generatedFiles;
        job.status = 'completed';
        job.completedAt = new Date();
      } finally {
        // Cleanup temp prompt file
        await unlink(tmpFile).catch(() => {});
        // Cleanup context directory
        if (contextDir) {
          await this.cleanupContextDirectory(contextDir);
        }
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';

      broadcastToJob(job.id, {
        type: 'error',
        message: job.error,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  private async loadTemplate(provider: Provider): Promise<string> {
    const templateFile =
      provider === 'vapi'
        ? 'template-vapi.yaml'
        : provider === 'viernes'
          ? 'template-viernes.yaml'
          : 'template.yaml';

    const templatePath = join(TEMPLATES_DIR, templateFile);

    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    return readFile(templatePath, 'utf-8');
  }

  private async buildPrompt(userContent: string, template: string, job: Job): Promise<string> {
    const provider = job.provider;
    let prompt = this.promptTemplate!;

    // Remove file references that won't exist
    prompt = prompt.replace(/@\$\{agentJsonPath\}/g, '');
    prompt = prompt.replace(/@\$\{agentMdPath\}/g, '');
    prompt = prompt.replace(/@\.\/tests\/template\.yaml/g, '');

    // Add provider context
    const providerContext = `# IMPORTANTE: Genera tests para ${provider.toUpperCase()} provider\nUsa la estructura del template de ${provider}.\n\n`;

    // Configuración específica para Viernes
    let viernesConfig = '';
    if (provider === 'viernes' && job.organizationId && job.agentId) {
      viernesConfig = `
## ⚠️ CONFIGURACIÓN VIERNES - VALORES OBLIGATORIOS

El usuario seleccionó estos valores en el frontend. DEBES usarlos en TODOS los tests:

- **organization_id**: ${job.organizationId}
- **agent_id**: ${job.agentId}

❌ NO uses los valores del template (son solo ejemplos)
✅ USA los valores de arriba en la sección viernes: de cada test

`;
    }

    // Configuración específica para ElevenLabs
    let elevenLabsConfig = '';
    if (provider === 'elevenlabs' && job.agentId) {
      elevenLabsConfig = `
## ⚠️ CONFIGURACIÓN ELEVENLABS - VALOR OBLIGATORIO

El usuario seleccionó este agente en el frontend. DEBES usarlo en TODOS los tests:

- **agent_id**: ${job.agentId}

❌ NO uses el valor del template (es solo un ejemplo)
✅ USA el valor de arriba en cada test

`;

      // Obtener variables dinámicas del agente
      try {
        const agentConfig = await getElevenLabsAgentConfig(String(job.agentId));
        const dynamicVars = agentConfig.dynamicVariables;
        const varKeys = Object.keys(dynamicVars);

        // Limitar cantidad de variables para evitar prompts muy largos
        const MAX_VARIABLES = 20;
        const limitedVarKeys = varKeys.slice(0, MAX_VARIABLES);

        if (limitedVarKeys.length > 0) {
          // Sanitizar valores para prevenir prompt injection
          const sanitizeValue = (value: string): string => {
            return value
              .replace(/\n/g, ' ')           // Remover saltos de línea
              .replace(/[#*`\[\]]/g, '')     // Remover caracteres markdown especiales
              .substring(0, 100);             // Limitar longitud
          };

          const varList = limitedVarKeys.map(key => {
            const defaultValue = sanitizeValue(dynamicVars[key] || '');
            const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
            return `- **${sanitizedKey}**: valor por defecto "${defaultValue}"`;
          }).join('\n');

          const truncatedWarning = varKeys.length > MAX_VARIABLES
            ? `\n(Mostrando ${MAX_VARIABLES} de ${varKeys.length} variables)\n`
            : '';

          elevenLabsConfig += `
## 🔧 VARIABLES DINÁMICAS DEL AGENTE

El agente tiene las siguientes variables dinámicas configuradas que DEBES incluir en la sección \`dynamic_variables\` de CADA test:
${truncatedWarning}
${varList}

⚠️ IMPORTANTE:
- Genera valores APROPIADOS y REALISTAS para cada variable según el escenario del test
- Para tests de error/datos inválidos, usa valores que provoquen el escenario (ej: documento inválido "ABC123")
- Para happy paths, usa valores válidos y realistas
- NO uses los valores por defecto mostrados arriba, genera valores VARIADOS para cada test
- Considera el contexto del test para elegir valores apropiados (nombres, documentos, teléfonos, etc.)

`;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[ClaudeExecutor] Error obteniendo variables dinámicas del agente ${job.agentId}: ${errorMessage}`);
        // Continuar sin variables dinámicas (graceful degradation)
      }
    }

    // Instrucciones de contexto para proveedores de voz
    let voiceContextInstructions = '';
    if (provider === 'elevenlabs' || provider === 'vapi') {
      voiceContextInstructions = `
## 📞 CONTEXTO DE COMUNICACIÓN: LLAMADA TELEFÓNICA

IMPORTANTE: Este agente se comunica mediante LLAMADAS DE VOZ.

Al generar el campo \`simulated_user.first_message\`, ten en cuenta que:

1. **¿QUIÉN INICIA LA LLAMADA? (Contexto Crítico)**

   **Escenario A: El AGENTE llama al usuario (llamada saliente/outbound)**
   - El usuario CONTESTA una llamada entrante
   - first_message debe ser REACTIVO e interrogativo
   - Ejemplos: "¿Aló?", "¿Sí?", "¿Quién habla?", "Diga"
   - **Este es el escenario MÁS COMÚN para voice agents**

   **Escenario B: El USUARIO llama al agente (llamada entrante/inbound - línea de soporte)**
   - El usuario INICIA con un propósito específico
   - first_message puede ser más DIRECTO
   - Ejemplos: "Hola, llamo por...", "Buenos días, necesito ayuda con..."

   **Por defecto, asumir Escenario A (agente llama) a menos que el contexto indique lo contrario.**

2. **Variaciones regionales de saludos telefónicos:**
   - **España:** "¿Dígame?" o "Diga"
   - **México:** "¿Bueno?"
   - **Argentina:** "Hola" o "¿Sí?"
   - **Chile/Colombia/Perú:** "¿Aló?"
   - **Cuba/Caribe:** "Oigo" o "¿Dígame?"
   - **Inglés (US/UK):** "Hello?", "Yes?", "Speaking?"
   - **Nota:** Estas variaciones son IMPORTANTES y reflejan patrones culturales reales

3. **Contexto profesional vs. personal:**
   - **Llamadas personales/casuales:** "¿Aló?", "¿Sí?", "¿Bueno?", "Diga"
   - **Contexto empresarial/profesional:** "Buenos días", "Buenas tardes", "[Nombre Empresa], ¿en qué puedo ayudarle?"
   - **Considera:** Si el agente representa una empresa (banco, soporte), el usuario puede responder más formalmente

4. **Variaciones por hora del día (contexto profesional):**
   - Mañana (6am-12pm): "Buenos días"
   - Tarde (12pm-8pm): "Buenas tardes"
   - Noche (8pm-6am): "Buenas noches"
   - Nota: En contexto casual, estas variaciones son menos comunes al contestar

5. **Características del first_message:**
   - Debe sonar NATURAL para una llamada telefónica real
   - Puede incluir tono de interrogación (¿...?)
   - Puede reflejar sorpresa/curiosidad inicial (Escenario A)
   - Debe ser BREVE y REACTIVO (no más de 2-3 palabras típicamente)
   - Refleja que la persona está RESPONDIENDO, no iniciando

6. **Ejemplos de cómo NO debe ser (Escenario A - agente llama):**
   ❌ "Hola, necesito ayuda con mi cuenta" (demasiado directo para contestar teléfono)
   ❌ "Quiero información sobre productos" (no natural al contestar)
   ❌ "Buenos días, quisiera hacer una consulta" (usuario no inicia, responde)

7. **Ejemplos de cómo SÍ debe ser (Escenario A - agente llama):**
   ✅ "¿Aló?"
   ✅ "Diga"
   ✅ "¿Sí?"
   ✅ "¿Quién habla?"
   ✅ "Buenos días" (si responde formalmente)
   ✅ "¿Bueno?" (México)
   ✅ "Hello?" (inglés)

`;
    }

    // Instrucciones de contexto para proveedor de chat
    let chatContextInstructions = '';
    if (provider === 'viernes') {
      chatContextInstructions = `
## 💬 CONTEXTO DE COMUNICACIÓN: CHATBOT DE MENSAJERÍA

IMPORTANTE: Este agente se comunica mediante MENSAJES DE TEXTO (WhatsApp, Telegram, Facebook, Instagram, Web).

Al generar el campo \`simulated_user.first_message\`, ten en cuenta que:

1. **El usuario está INICIANDO una conversación de chat**
   - Es un mensaje de texto, no una llamada telefónica
   - El usuario ESCRIBE el primer mensaje al agente
   - El usuario tiene un propósito o necesidad específica
   - Puede escribir a su propio ritmo, sin presión de tiempo real

2. **Matriz de Formalidad por Industria (IMPORTANTE):**

   **ALTA FORMALIDAD (formal, sin emojis, usar "usted"):**
   - Servicios bancarios y financieros
   - Servicios legales y jurídicos
   - Servicios médicos y de salud
   - Seguros y pensiones
   - Gobierno y servicios públicos
   - Ejemplos: "Buenos días, necesito consultar mi saldo", "Buenas tardes, quisiera información sobre..."

   **FORMALIDAD MODERADA (profesional pero amigable):**
   - E-commerce y retail
   - Soporte técnico y servicio al cliente
   - Servicios de delivery y logística
   - Educación y capacitación
   - Inmobiliaria y bienes raíces
   - Ejemplos: "Hola, quiero rastrear mi pedido", "Buen día, tengo una pregunta sobre..."

   **FORMALIDAD BAJA (casual, emojis permitidos):**
   - Entretenimiento y ocio
   - Moda, belleza y lifestyle
   - Food & beverage, restaurantes
   - Redes sociales y comunidades
   - Servicios de streaming
   - Ejemplos: "Hola! Quiero hacer un pedido 😊", "Hey, qué tal?"

   **Ajusta el tono del first_message según la industria del agente.**

3. **Plataformas de mensajería - Consideraciones importantes:**
   - El TONO y ESTILO de comunicación es CONSISTENTE entre plataformas
   - WhatsApp, Telegram, Facebook Messenger, Instagram, Web chat tienen diferencias TÉCNICAS (listas, botones, ventanas de tiempo)
   - PERO estas diferencias técnicas NO afectan cómo el usuario escribe su primer mensaje
   - Los usuarios NO piensan "escribiré diferente porque esto es WhatsApp vs Telegram"
   - **Genera mensajes naturales que funcionarían en CUALQUIER app de mensajería**

4. **Estilos de first_message apropiados:**

   **Saludo simple:**
   - "Hola"
   - "Buenos días"
   - "Buenas tardes"
   - "Buen día"

   **Saludo + motivo (muy común):**
   - "Hola, necesito información sobre..."
   - "Buenos días, quisiera consultar..."
   - "Buenas tardes, tengo una pregunta sobre..."
   - "Hola! Quiero hacer un pedido"

   **Directo al asunto (válido en contextos casuales):**
   - "Quiero rastrear mi pedido #12345"
   - "Necesito ayuda con mi cuenta"
   - "Tengo un problema con..."

5. **Características del first_message:**
   - Debe ser apropiado para CHAT DE TEXTO (no voz)
   - Puede ser desde muy breve ("Hola") hasta incluir contexto completo
   - Es natural ir directo al asunto en chat (a diferencia de llamadas)
   - Puede incluir detalles específicos (números de orden, fechas, etc.)
   - En contextos casuales, emojis son naturales y apropiados

6. **Ejemplos de cómo SÍ debe ser:**
   ✅ "Hola" (simple y universal)
   ✅ "Buenos días" (formal)
   ✅ "Hola, necesito información sobre..." (saludo + motivo)
   ✅ "Quiero hacer una consulta" (directo)
   ✅ "Buenas tardes, quisiera saber..." (formal + motivo)
   ✅ "Hola! Quiero hacer un pedido 😊" (casual con emoji, apropiado para retail/food)

7. **Ejemplos de cómo NO debe ser:**
   ❌ "¿Aló?" (esto es para llamadas telefónicas, NO para chat)
   ❌ "Diga" (contexto de teléfono, no chat)
   ❌ "¿Sí?" (respuesta telefónica, no inicio de chat)
   ❌ "¿Quién habla?" (no tiene sentido en chat donde el usuario inicia)
   ❌ "¿Bueno?" (saludo telefónico mexicano, no para mensajería)

`;
    }

    // Construir instrucción de número de tests
    let testCountInstruction: string;
    if (job.options?.testCount) {
      // Si el usuario especificó un número, limitarlo
      testCountInstruction = `1. Genera exactamente ${job.options.testCount} tests basados en el contenido proporcionado`;
    } else {
      // Si no especificó, dejar que Claude decida (mantener comportamiento original)
      testCountInstruction = `1. Genera entre 15-25 tests basados en el contenido proporcionado`;
    }

    // Build final prompt
    const finalPrompt = `${providerContext}${viernesConfig}${elevenLabsConfig}${voiceContextInstructions}${chatContextInstructions}${prompt}

## TEMPLATE DE REFERENCIA

Usa este template como base para generar los tests:

\`\`\`yaml
${template}
\`\`\`

## CONTENIDO DEL USUARIO

Usa la siguiente informacion como contexto para generar los tests:

${userContent}

## INSTRUCCIONES FINALES

${testCountInstruction}
2. Cada test debe estar en un bloque YAML separado
3. Usa el formato del template de ${provider}
4. Nombra cada archivo siguiendo la convencion: p{0-3}-{categoria}-{descripcion}.yaml
5. Muestra cada YAML en un bloque de codigo separado con \`\`\`yaml
`;

    return finalPrompt;
  }

  private runClaude(promptFile: string, jobId: string, contextFilePaths: string[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
      const claudePath = this.findClaudePath();

      // Build prompt string with all @file references combined
      // Claude expects: claude -p "@prompt.txt @context1.txt @context2.txt" --dangerously-skip-permissions
      const allFileRefs = [`@${promptFile}`, ...contextFilePaths.map(f => `@${f}`)].join(' ');

      const args = [
        '-p',
        allFileRefs,
        '--dangerously-skip-permissions',
      ];

      const child = spawn(claudePath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Pass through the OAuth token if set
          CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
        },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Detect YAML blocks being created
        if (chunk.includes('```yaml')) {
          broadcastToJob(jobId, {
            type: 'progress',
            message: 'Generando test case...',
            timestamp: new Date().toISOString(),
          });
        }
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Timeout after 15 minutes
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Claude CLI timeout (15 minutes)'));
      }, 15 * 60 * 1000);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

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

  private parseYAMLBlocks(output: string): string[] {
    const blocks: string[] = [];
    const regex = /```yaml\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(output)) !== null) {
      const yamlContent = match[1].trim();
      if (yamlContent) {
        blocks.push(yamlContent);
      }
    }

    return blocks;
  }

  private generateFilename(yamlContent: string, index: number): string {
    try {
      const parsed = parseYAML(yamlContent);
      if (parsed && parsed.name) {
        // Extract name and sanitize
        const name = String(parsed.name)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .substring(0, 50);
        return `${name}.yaml`;
      }
    } catch (error) {
      console.warn(`[ClaudeExecutor] Failed to parse YAML for filename extraction: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return `test-${String(index + 1).padStart(3, '0')}.yaml`;
  }

  // ==================== RALPH ITERATIVE MODE ====================

  /**
   * Sets up Ralph workspace with templates and context files
   */
  private async setupRalphWorkspace(
    jobId: string,
    provider: Provider,
    contextFiles: ContextFile[],
    job: Job
  ): Promise<string> {
    const workspaceDir = join(tmpdir(), `ralph-workspaces`, jobId);
    const specsDir = join(workspaceDir, 'specs');
    const testsDir = join(workspaceDir, 'tests');

    // Create directories
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(specsDir, { recursive: true });
    await mkdir(testsDir, { recursive: true });

    // Copy Ralph templates
    const templateFiles = ['PROMPT.md', '@fix_plan.md', '@AGENT.md'];
    for (const templateFile of templateFiles) {
      const srcPath = join(RALPH_TEMPLATES_DIR, templateFile);
      const destPath = join(workspaceDir, templateFile);

      if (existsSync(srcPath)) {
        let content = await readFile(srcPath, 'utf-8');

        // Customize PROMPT.md with provider context
        if (templateFile === 'PROMPT.md') {
          content = content.replace(/\{\{PROVIDER\}\}/g, provider.toUpperCase());

          // Add provider-specific configuration
          let providerConfig = '';
          if (provider === 'viernes' && job.organizationId && job.agentId) {
            providerConfig = `
## Viernes Configuration (REQUIRED)
- **organization_id**: ${job.organizationId}
- **agent_id**: ${job.agentId}

Use these values in the \`viernes:\` section of EVERY test.
`;
          } else if (provider === 'elevenlabs' && job.agentId) {
            providerConfig = `
## ElevenLabs Configuration (REQUIRED)
- **agent_id**: "${job.agentId}"

Use this value in the \`agent_id:\` field of EVERY test.
`;
          } else if (provider === 'vapi') {
            providerConfig = `
## VAPI Configuration
Generate tests with appropriate VAPI schema structure.
`;
          }
          content = content.replace(/\{\{PROVIDER_CONFIG\}\}/g, providerConfig);

          // Add test count instruction if specified
          let testCountInstruction = '';
          if (job.options?.testCount) {
            testCountInstruction = `
## Test Count Requirement (CRITICAL)
**Generate EXACTLY ${job.options.testCount} tests.** No more, no less.
This is a hard requirement from the user.
`;
          }
          content = content.replace(/\{\{TEST_COUNT_INSTRUCTION\}\}/g, testCountInstruction);
        }

        await writeFile(destPath, content, 'utf-8');
      }
    }

    // Copy user context files to specs/ (sanitize filenames to prevent path traversal)
    for (const file of contextFiles) {
      const safeName = sanitizeFilename(file.name);
      const filePath = join(specsDir, safeName);
      await writeFile(filePath, file.content, 'utf-8');
    }

    // Initialize git repo (required by Ralph/Claude Code)
    const { execSync } = await import('child_process');
    try {
      execSync('git init', { cwd: workspaceDir, stdio: 'ignore' });
      execSync('git add -A', { cwd: workspaceDir, stdio: 'ignore' });
      execSync('git commit -m "Initial workspace setup" --allow-empty', {
        cwd: workspaceDir,
        stdio: 'ignore',
        env: { ...process.env, GIT_AUTHOR_NAME: 'Ralph', GIT_AUTHOR_EMAIL: 'ralph@test.local', GIT_COMMITTER_NAME: 'Ralph', GIT_COMMITTER_EMAIL: 'ralph@test.local' }
      });
    } catch (error) {
      console.warn(`[ClaudeExecutor] Git init failed in workspace (non-critical): ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return workspaceDir;
  }

  /**
   * Executes a single Ralph iteration
   */
  private runRalphIteration(workspaceDir: string, jobId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const claudePath = this.findClaudePath();

      const args = [
        '-p',
        '@PROMPT.md',
        '--dangerously-skip-permissions',
      ];

      const child = spawn(claudePath, args, {
        cwd: workspaceDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
        },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Ralph iteration timeout (${RALPH_ITERATION_TIMEOUT / 60000} minutes)`));
      }, RALPH_ITERATION_TIMEOUT);

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(stdout);
        } else {
          // Even on non-zero exit, return output for status parsing
          resolve(stdout || stderr);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Parses RALPH_STATUS block from output
   */
  private parseRalphStatus(output: string): RalphStatusBlock | null {
    const statusMatch = output.match(/---RALPH_STATUS---\s*([\s\S]*?)\s*---END_RALPH_STATUS---/);
    if (!statusMatch) {
      return null;
    }

    const statusBlock = statusMatch[1];
    const getField = (field: string): string => {
      const match = statusBlock.match(new RegExp(`${field}:\\s*(.+)`, 'i'));
      return match ? match[1].trim() : '';
    };

    const status = getField('STATUS') as RalphStatusBlock['status'];
    const tasksCompletedThisLoop = parseInt(getField('TASKS_COMPLETED_THIS_LOOP')) || 0;
    const filesModified = parseInt(getField('FILES_MODIFIED')) || 0;
    const testsStatus = getField('TESTS_STATUS') as RalphStatusBlock['testsStatus'] || 'NOT_RUN';
    const workType = getField('WORK_TYPE') as RalphStatusBlock['workType'] || 'IMPLEMENTATION';
    const exitSignalStr = getField('EXIT_SIGNAL').toLowerCase();
    const exitSignal = exitSignalStr === 'true';
    const recommendation = getField('RECOMMENDATION');

    return {
      status: status || 'IN_PROGRESS',
      tasksCompletedThisLoop,
      filesModified,
      testsStatus,
      workType,
      exitSignal,
      recommendation,
    };
  }

  /**
   * Collects generated YAML files from Ralph workspace
   */
  private async collectRalphOutput(workspaceDir: string): Promise<Array<{ name: string; content: string }>> {
    const testsDir = join(workspaceDir, 'tests');
    const files: Array<{ name: string; content: string }> = [];

    try {
      const yamlFiles = await glob('*.yaml', { cwd: testsDir });

      for (const filename of yamlFiles) {
        const filePath = join(testsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        files.push({ name: filename, content });
      }
    } catch (error) {
      console.warn(`[ClaudeExecutor] Failed to collect Ralph output: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return files;
  }

  /**
   * Executes test generation using Ralph iterative mode
   */
  async executeWithRalph(job: Job): Promise<void> {
    const maxIterations = job.options?.maxIterations || RALPH_MAX_ITERATIONS;
    const startTime = Date.now();

    broadcastToJob(job.id, {
      type: 'progress',
      message: 'Iniciando modo Ralph iterativo...',
      timestamp: new Date().toISOString(),
    });

    let workspaceDir: string | null = null;

    try {
      // Setup workspace
      const contextFiles = job.contextFiles || [];
      if (contextFiles.length === 0 && job.content) {
        // Convert deprecated content to file
        contextFiles.push({ name: 'agent-spec.md', content: job.content });
      }

      workspaceDir = await this.setupRalphWorkspace(job.id, job.provider, contextFiles, job);

      broadcastToJob(job.id, {
        type: 'progress',
        message: `Workspace Ralph creado con ${contextFiles.length} archivos de especificacion`,
        timestamp: new Date().toISOString(),
      });

      let totalTestsGenerated = 0;
      let totalTasksCompleted = 0;

      // Main iteration loop
      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        // Check total timeout
        if (Date.now() - startTime > RALPH_TOTAL_TIMEOUT) {
          broadcastToJob(job.id, {
            type: 'progress',
            message: `Timeout total alcanzado (${RALPH_TOTAL_TIMEOUT / 60000} minutos)`,
            timestamp: new Date().toISOString(),
          });
          break;
        }

        broadcastToJob(job.id, {
          type: 'progress',
          message: `Ralph iteracion ${iteration}/${maxIterations}...`,
          timestamp: new Date().toISOString(),
          data: {
            iteration,
            maxIterations,
            tasksCompleted: totalTasksCompleted,
            testsGenerated: totalTestsGenerated,
            workType: 'IMPLEMENTATION',
          },
        });

        try {
          // Run Ralph iteration
          const output = await this.runRalphIteration(workspaceDir, job.id);

          // Parse status
          const status = this.parseRalphStatus(output);

          if (status) {
            totalTasksCompleted += status.tasksCompletedThisLoop;

            // Collect current test count
            const currentFiles = await this.collectRalphOutput(workspaceDir);
            totalTestsGenerated = currentFiles.length;

            broadcastToJob(job.id, {
              type: 'progress',
              message: `Iteracion ${iteration}: ${status.tasksCompletedThisLoop} tareas, ${totalTestsGenerated} tests generados`,
              timestamp: new Date().toISOString(),
              data: {
                iteration,
                maxIterations,
                tasksCompleted: totalTasksCompleted,
                testsGenerated: totalTestsGenerated,
                workType: status.workType,
              },
            });

            // Check exit conditions
            if (status.exitSignal || status.status === 'COMPLETE') {
              broadcastToJob(job.id, {
                type: 'progress',
                message: `Ralph completado: ${status.recommendation || 'Todas las tareas finalizadas'}`,
                timestamp: new Date().toISOString(),
              });
              break;
            }

            if (status.status === 'BLOCKED') {
              broadcastToJob(job.id, {
                type: 'progress',
                message: `Ralph bloqueado: ${status.recommendation || 'Se requiere intervencion manual'}`,
                timestamp: new Date().toISOString(),
              });
              break;
            }
          } else {
            // No status block found - may be first iteration or error
            broadcastToJob(job.id, {
              type: 'progress',
              message: `Iteracion ${iteration} completada (sin bloque de estado)`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (iterError) {
          const errorMsg = iterError instanceof Error ? iterError.message : 'Error desconocido';
          broadcastToJob(job.id, {
            type: 'progress',
            message: `Error en iteracion ${iteration}: ${errorMsg}`,
            timestamp: new Date().toISOString(),
          });
          // Continue to next iteration unless it's a critical error
          if (errorMsg.includes('timeout')) {
            break;
          }
        }
      }

      // Collect final output
      const generatedFiles = await this.collectRalphOutput(workspaceDir);

      if (generatedFiles.length === 0) {
        broadcastToJob(job.id, {
          type: 'progress',
          message: 'Ralph no genero archivos YAML. Verificar especificaciones de entrada.',
          timestamp: new Date().toISOString(),
        });
      }

      // Broadcast each file
      for (let i = 0; i < generatedFiles.length; i++) {
        const file = generatedFiles[i];
        broadcastToJob(job.id, {
          type: 'file_created',
          message: `Archivo creado: ${file.name}`,
          timestamp: new Date().toISOString(),
          data: {
            filename: file.name,
            content: file.content.substring(0, 500),
            currentFile: i + 1,
            totalFiles: generatedFiles.length,
          },
        });
      }

      job.generatedFiles = generatedFiles;
      job.status = 'completed';
      job.completedAt = new Date();

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';

      broadcastToJob(job.id, {
        type: 'error',
        message: job.error,
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
export const claudeExecutor = new ClaudeExecutor();
