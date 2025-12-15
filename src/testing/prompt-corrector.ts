/**
 * Clase para generar instrucciones corregidas del asistente basándose en tests fallidos
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import type { TestResult } from '../types/index.js';
import type { ProviderType } from '../adapters/provider-factory.js';
import { ElevenLabsClient } from '../api/elevenlabs-client.js';
import { VapiClient } from '../api/vapi-client.js';

export interface PromptCorrectorOptions {
  agentsDir?: string;
  resultsDir?: string;
  promptsDir?: string;
  model?: string;
  verbose?: boolean;
}

export interface CorrectionResult {
  filepath: string;
  hasChanges: boolean;
  problemsFound: number;
  provider: ProviderType;
}

/**
 * Genera instrucciones corregidas para asistentes de voz/chat basándose en tests fallidos
 */
export class PromptCorrector {
  private agentsDir: string;
  private resultsDir: string;
  private promptsDir: string;
  private model: string;
  private verbose: boolean;
  private openai: OpenAI | null = null;

  constructor(options: PromptCorrectorOptions = {}) {
    this.agentsDir = options.agentsDir || './agents';
    this.resultsDir = options.resultsDir || './results';
    this.promptsDir = options.promptsDir || './prompts';
    this.model = options.model || process.env.OPENAI_API_KEY ? 'gpt-4o' : '';
    this.verbose = options.verbose || false;

    // Inicializar OpenAI si hay API key
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
  }

  /**
   * Genera instrucciones corregidas si hay tests fallidos
   */
  async generateCorrectedInstructions(
    results: TestResult[],
    agentId: string,
    provider: ProviderType = 'elevenlabs'
  ): Promise<CorrectionResult | null> {
    // Filtrar solo tests fallidos
    const failedTests = results.filter(r => !r.success);

    if (failedTests.length === 0) {
      if (this.verbose) {
        console.log('[PromptCorrector] No hay tests fallidos, no se requiere corrección');
      }
      return null;
    }

    console.log(`\n📝 Generando instrucciones corregidas (${failedTests.length} tests fallidos)...`);

    // Leer las instrucciones actuales del agente
    const currentInstructions = await this.loadCurrentInstructions(agentId, provider);

    if (!currentInstructions) {
      console.warn('[PromptCorrector] No se encontraron instrucciones del agente');
      console.warn(`   Ejecuta primero: npm run download -- --agent ${agentId}`);
      return null;
    }

    // Generar el análisis de tests fallidos
    const failedTestsDetails = this.formatFailedTestsDetails(failedTests);

    // Determinar el tipo de asistente
    const assistantType = this.getAssistantType(provider);

    // Generar instrucciones corregidas
    let correctedContent: string;

    if (this.openai) {
      correctedContent = await this.generateWithOpenAI(
        currentInstructions,
        failedTestsDetails,
        provider,
        assistantType
      );
    } else {
      correctedContent = this.generateBasicCorrection(
        currentInstructions,
        failedTests,
        provider,
        assistantType
      );
    }

    // Guardar el archivo
    await this.ensureDir(this.resultsDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `corrected-instructions-${timestamp}.md`;
    const filepath = join(this.resultsDir, filename);

    await writeFile(filepath, correctedContent, 'utf-8');

    console.log(`✅ Instrucciones corregidas guardadas en: ${filepath}`);

    return {
      filepath,
      hasChanges: true,
      problemsFound: failedTests.length,
      provider,
    };
  }

  /**
   * Carga las instrucciones actuales del agente desde los archivos descargados
   * Si no existen, intenta descargarlos automáticamente
   */
  private async loadCurrentInstructions(agentId: string, provider: ProviderType): Promise<string | null> {
    // Primero buscar el archivo .md con el prompt
    const mdPath = join(this.agentsDir, `${agentId}.md`);

    if (existsSync(mdPath)) {
      try {
        const content = await readFile(mdPath, 'utf-8');
        if (this.verbose) {
          console.log(`[PromptCorrector] Cargando instrucciones desde: ${mdPath}`);
        }
        return content;
      } catch (error) {
        console.warn(`[PromptCorrector] Error leyendo ${mdPath}:`, error);
      }
    }

    // Si no existe el .md, intentar extraer del .json
    const jsonPath = join(this.agentsDir, `${agentId}.json`);

    if (existsSync(jsonPath)) {
      try {
        const content = await readFile(jsonPath, 'utf-8');
        const config = JSON.parse(content);

        // Extraer prompt según el provider
        if (provider === 'elevenlabs') {
          return config.conversation_config?.agent?.prompt?.prompt || null;
        } else if (provider === 'vapi') {
          const systemMessage = config.model?.messages?.find((m: any) => m.role === 'system');
          return systemMessage?.content || null;
        } else if (provider === 'viernes') {
          // Viernes puede tener diferentes estructuras
          return config.prompt || config.instructions || null;
        }
      } catch (error) {
        console.warn(`[PromptCorrector] Error leyendo ${jsonPath}:`, error);
      }
    }

    // Si no existe ningún archivo, intentar descargar automáticamente
    console.log(`[PromptCorrector] Descargando configuración del agente ${agentId}...`);

    try {
      const downloadedPrompt = await this.downloadAgentConfig(agentId, provider);
      if (downloadedPrompt) {
        return downloadedPrompt;
      }
    } catch (error) {
      console.warn(`[PromptCorrector] Error descargando agente: ${error instanceof Error ? error.message : String(error)}`);
    }

    return null;
  }

  /**
   * Descarga la configuración del agente y extrae el prompt
   */
  private async downloadAgentConfig(agentId: string, provider: ProviderType): Promise<string | null> {
    await this.ensureDir(this.agentsDir);

    try {
      let agentConfig: any;
      let prompt: string | null = null;

      if (provider === 'elevenlabs') {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          console.warn('[PromptCorrector] ELEVENLABS_API_KEY no configurada');
          return null;
        }

        const client = new ElevenLabsClient({ apiKey });
        agentConfig = await client.getAgent(agentId);

        // Extraer el prompt
        if (agentConfig.conversation_config?.agent?.prompt?.prompt) {
          prompt = agentConfig.conversation_config.agent.prompt.prompt;
        }
      } else if (provider === 'vapi') {
        const apiKey = process.env.VAPI_API_KEY;
        if (!apiKey) {
          console.warn('[PromptCorrector] VAPI_API_KEY no configurada');
          return null;
        }

        const client = new VapiClient({ apiKey });
        agentConfig = await client.getAssistant(agentId);

        // Extraer el prompt del system message
        if (agentConfig.model?.messages) {
          const systemMessage = agentConfig.model.messages.find((m: any) => m.role === 'system');
          if (systemMessage) {
            prompt = systemMessage.content;
          }
        }
      } else if (provider === 'viernes') {
        // Viernes no tiene API para descargar configuración
        console.warn('[PromptCorrector] Viernes no soporta descarga automática de configuración');
        return null;
      }

      if (!prompt) {
        console.warn('[PromptCorrector] No se encontró prompt en la configuración del agente');
        return null;
      }

      // Guardar el prompt en archivo .md
      const mdPath = join(this.agentsDir, `${agentId}.md`);
      await writeFile(mdPath, prompt, 'utf-8');
      console.log(`[PromptCorrector] Prompt guardado en: ${mdPath}`);

      // Guardar la configuración completa en .json (sin el prompt para no duplicar)
      const jsonPath = join(this.agentsDir, `${agentId}.json`);
      await writeFile(jsonPath, JSON.stringify(agentConfig, null, 2), 'utf-8');
      console.log(`[PromptCorrector] Configuración guardada en: ${jsonPath}`);

      return prompt;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Formatea los detalles de los tests fallidos para el prompt
   */
  private formatFailedTestsDetails(failedTests: TestResult[]): string {
    let details = '';

    for (const test of failedTests) {
      details += `\n### Test: ${test.test_name}\n\n`;

      // Criterios fallidos
      const criteriaResults = Object.values(test.simulation_response.analysis.evaluation_criteria_results);
      const failedCriteria = criteriaResults.filter(c => c.result === 'failure');

      if (failedCriteria.length > 0) {
        details += '**Criterios Fallidos:**\n';
        for (const criteria of failedCriteria) {
          details += `- **${criteria.criteria_id}**: ${criteria.rationale}\n`;
        }
        details += '\n';
      }

      // Conversación
      details += '**Conversación:**\n```\n';
      for (const turn of test.simulation_response.simulated_conversation) {
        details += `[${turn.role.toUpperCase()}]: ${turn.message}\n`;
      }
      details += '```\n\n';

      // Resumen
      details += `**Resumen:** ${test.simulation_response.analysis.transcript_summary}\n`;
      details += '---\n';
    }

    return details;
  }

  /**
   * Determina el tipo de asistente basado en el provider
   */
  private getAssistantType(provider: ProviderType): string {
    switch (provider) {
      case 'elevenlabs':
        return 'Asistente de Voz (ElevenLabs)';
      case 'vapi':
        return 'Asistente de Voz (Vapi)';
      case 'viernes':
        return 'Asistente de Chat (Viernes)';
      default:
        return 'Asistente Conversacional';
    }
  }

  /**
   * Genera instrucciones corregidas usando OpenAI
   */
  private async generateWithOpenAI(
    currentInstructions: string,
    failedTestsDetails: string,
    provider: ProviderType,
    assistantType: string
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    // Cargar el template del prompt
    const templatePath = join(this.promptsDir, 'correct-instructions.md');
    let template = '';

    if (existsSync(templatePath)) {
      template = await readFile(templatePath, 'utf-8');
    } else {
      template = this.getDefaultTemplate();
    }

    // Reemplazar variables en el template
    const prompt = template
      .replace(/\$\{provider\}/g, provider)
      .replace(/\$\{assistantType\}/g, assistantType)
      .replace(/\$\{currentInstructions\}/g, currentInstructions)
      .replace(/\$\{failedTestsDetails\}/g, failedTestsDetails);

    if (this.verbose) {
      console.log('[PromptCorrector] Generating with OpenAI, prompt length:', prompt.length);
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Eres un experto en diseño de asistentes conversacionales. Tu tarea es corregir las instrucciones de un asistente basándote en los tests que han fallado. Genera instrucciones completas y corregidas en formato Markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      });

      return completion.choices[0]?.message?.content || this.generateBasicCorrection(
        currentInstructions,
        [],
        provider,
        assistantType
      );
    } catch (error: any) {
      console.error('[PromptCorrector] Error calling OpenAI:', error.message);
      throw error;
    }
  }

  /**
   * Genera una corrección básica sin usar LLM
   */
  private generateBasicCorrection(
    currentInstructions: string,
    failedTests: TestResult[],
    provider: ProviderType,
    assistantType: string
  ): string {
    const timestamp = new Date().toLocaleString('es-CO');

    let content = `# Instrucciones Corregidas del Asistente

**Generado:** ${timestamp}
**Provider:** ${provider}
**Tipo:** ${assistantType}

---

## Resumen de Cambios

### Problemas Identificados

`;

    // Listar problemas encontrados
    for (const test of failedTests) {
      const criteriaResults = Object.values(test.simulation_response.analysis.evaluation_criteria_results);
      const failedCriteria = criteriaResults.filter(c => c.result === 'failure');

      content += `#### ${test.test_name}\n`;
      for (const criteria of failedCriteria) {
        content += `- ${criteria.criteria_id}: ${criteria.rationale}\n`;
      }
      content += '\n';
    }

    content += `### Correcciones Sugeridas

> **Nota:** Este análisis fue generado sin LLM. Para obtener instrucciones corregidas automáticamente, configura OPENAI_API_KEY en tu archivo .env

Las siguientes áreas requieren atención basándose en los tests fallidos:

`;

    // Agrupar por tipo de problema
    const issueTypes = new Set<string>();
    for (const test of failedTests) {
      const criteriaResults = Object.values(test.simulation_response.analysis.evaluation_criteria_results);
      for (const c of criteriaResults) {
        if (c.result === 'failure') {
          issueTypes.add(c.criteria_id);
        }
      }
    }

    for (const issueType of issueTypes) {
      content += `- Revisar comportamiento relacionado con: **${issueType}**\n`;
    }

    content += `
---

## Instrucciones Actuales

\`\`\`
${currentInstructions}
\`\`\`

---

## Notas de Implementación

1. Revisa manualmente cada problema identificado
2. Actualiza las instrucciones del agente en la plataforma correspondiente
3. Ejecuta los tests nuevamente para verificar las correcciones
4. Si usas ElevenLabs: actualiza en el dashboard o via API
5. Si usas Viernes: actualiza en la configuración del bot

---

## Conversaciones de Tests Fallidos

`;

    // Incluir conversaciones para contexto
    for (const test of failedTests) {
      content += `### ${test.test_name}\n\n\`\`\`\n`;
      for (const turn of test.simulation_response.simulated_conversation) {
        content += `[${turn.role.toUpperCase()}]: ${turn.message}\n`;
      }
      content += `\`\`\`\n\n`;
    }

    return content;
  }

  /**
   * Template por defecto si no existe el archivo
   */
  private getDefaultTemplate(): string {
    return `# Corrección de Instrucciones del Asistente

## Contexto

### Tipo de Asistente
- **Provider**: \${provider}
- **Tipo**: \${assistantType}

### Instrucciones Actuales del Asistente
\`\`\`
\${currentInstructions}
\`\`\`

### Resultados de Pruebas Fallidas

\${failedTestsDetails}

## Tarea

Genera las instrucciones completas corregidas del asistente que solucionen los problemas identificados en los tests fallidos.

Incluye:
1. Resumen de problemas encontrados
2. Correcciones aplicadas
3. Instrucciones completas listas para usar
4. Notas de implementación`;
  }

  /**
   * Asegura que el directorio exista
   */
  private async ensureDir(dir: string): Promise<void> {
    try {
      await mkdir(dir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Verifica si el corrector puede generar con LLM
   */
  canUseAI(): boolean {
    return this.openai !== null;
  }
}
