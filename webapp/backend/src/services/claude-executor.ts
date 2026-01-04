import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { parse as parseYAML } from 'yaml';
import type { Provider, Job, ContextFile } from '../types/index.js';
import { broadcastToJob } from '../middleware/sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths relativos al backend
// En desarrollo: backend/src/services -> ../../shared
// En Docker: /app/dist/services -> ../../shared (-> /app/shared)
const SHARED_DIR = join(__dirname, '../../shared');
const PROMPTS_DIR = join(SHARED_DIR, 'prompts');
const TEMPLATES_DIR = join(SHARED_DIR, 'templates');

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
      const filePath = join(contextDir, file.name);
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
      const fullPrompt = this.buildPrompt(userContent, template, job);

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

  private buildPrompt(userContent: string, template: string, job: Job): string {
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
        shell: true,
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

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Claude CLI timeout (5 minutes)'));
      }, 5 * 60 * 1000);

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
    } catch {
      // Ignore parse errors
    }

    return `test-${String(index + 1).padStart(3, '0')}.yaml`;
  }
}

// Singleton instance
export const claudeExecutor = new ClaudeExecutor();
