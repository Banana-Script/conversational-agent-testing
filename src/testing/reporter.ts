import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { TestResult } from '../types/index.js';

/**
 * Clase para generar reportes de resultados de tests
 */
export class Reporter {
  private resultsDir: string;

  constructor(resultsDir: string = './results') {
    this.resultsDir = resultsDir;
  }

  /**
   * Guarda resultados de tests en un archivo JSON
   */
  async saveTestResults(results: TestResult[]): Promise<string> {
    await this.ensureResultsDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.json`;
    const filepath = join(this.resultsDir, filename);

    const report = {
      generated_at: new Date().toISOString(),
      total_tests: results.length,
      successful_tests: results.filter((r) => r.success).length,
      failed_tests: results.filter((r) => !r.success).length,
      results,
    };

    await writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');

    return filepath;
  }


  /**
   * Genera un reporte en formato Markdown
   */
  async generateMarkdownReport(results: TestResult[]): Promise<string> {
    await this.ensureResultsDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `report-${timestamp}.md`;
    const filepath = join(this.resultsDir, filename);

    let markdown = '# Reporte de Testing de Agentes ElevenLabs\n\n';
    markdown += `**Generado:** ${new Date().toLocaleString('es-CO')}\n\n`;
    markdown += `---\n\n`;

    // Resumen ejecutivo
    markdown += '## 📊 Resumen Ejecutivo\n\n';
    markdown += `- **Total de tests ejecutados:** ${results.length}\n`;
    markdown += `- **Tests exitosos:** ${results.filter((r) => r.success).length} (${((results.filter((r) => r.success).length / results.length) * 100).toFixed(1)}%)\n`;
    markdown += `- **Tests fallidos:** ${results.filter((r) => !r.success).length}\n\n`;

    // Tabla de resumen
    markdown += '## 📋 Resumen de Tests\n\n';
    markdown += '| Test | Estado | Criterios Pasados | Tiempo (ms) |\n';
    markdown += '|------|--------|-------------------|-------------|\n';

    for (const result of results) {
      const status = result.success ? '✅ Exitoso' : '❌ Fallido';
      const criteriaResults = Object.values(
        result.simulation_response.analysis.evaluation_criteria_results
      );
      const passed = criteriaResults.filter((c) => c.result === 'success').length;
      const total = criteriaResults.length;
      markdown += `| ${result.test_name} | ${status} | ${passed}/${total} | ${result.execution_time_ms} |\n`;
    }

    markdown += '\n---\n\n';

    // Resultados detallados
    markdown += '## 📝 Resultados Detallados\n\n';

    for (const result of results) {
      markdown += `### ${result.test_name}\n\n`;
      markdown += `- **Estado:** ${result.success ? '✅ Exitoso' : '❌ Fallido'}\n`;
      markdown += `- **Timestamp:** ${new Date(result.timestamp).toLocaleString('es-CO')}\n`;
      markdown += `- **Tiempo de ejecución:** ${result.execution_time_ms}ms\n`;
      markdown += `- **Agent ID:** ${result.agent_id}\n\n`;

      markdown += '**Criterios de Evaluación:**\n\n';

      const criteriaResultsArray = Object.values(
        result.simulation_response.analysis.evaluation_criteria_results
      );

      for (const criteria of criteriaResultsArray) {
        const emoji =
          criteria.result === 'success'
            ? '✅'
            : criteria.result === 'failure'
              ? '❌'
              : '❓';
        markdown += `- ${emoji} **${criteria.criteria_id}:** ${criteria.result}\n`;
        if (criteria.rationale) {
          markdown += `  - *Razón:* ${criteria.rationale}\n`;
        }
      }

      markdown += '\n**Conversación:**\n\n';
      markdown += '```\n';

      for (const turn of result.simulation_response.simulated_conversation) {
        markdown += `[${turn.role.toUpperCase()}]: ${turn.message}\n`;
      }

      markdown += '```\n\n';
      markdown += '---\n\n';
    }

    await writeFile(filepath, markdown, 'utf-8');

    return filepath;
  }

  /**
   * Genera un resumen en consola con colores
   */
  generateConsoleSummary(results: TestResult[]): string {
    let summary = '\n';
    summary += '╔════════════════════════════════════════════════════════╗\n';
    summary += '║         RESUMEN DE EJECUCIÓN DE TESTS                  ║\n';
    summary += '╚════════════════════════════════════════════════════════╝\n\n';

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const successRate = (successful / results.length) * 100;

    summary += `Total de tests: ${results.length}\n`;
    summary += `✅ Exitosos: ${successful} (${successRate.toFixed(1)}%)\n`;
    summary += `❌ Fallidos: ${failed}\n\n`;

    summary += 'Resultados por test:\n';
    summary += '─'.repeat(60) + '\n';

    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      summary += `${status} ${result.test_name} - ${result.execution_time_ms}ms\n`;

      const criteriaResults = Object.values(
        result.simulation_response.analysis.evaluation_criteria_results
      );
      const passed = criteriaResults.filter((c) => c.result === 'success')
        .length;
      const total = criteriaResults.length;
      summary += `   Criterios: ${passed}/${total} pasados\n`;
    }

    summary += '─'.repeat(60) + '\n\n';

    return summary;
  }

  /**
   * Asegura que el directorio de resultados exista
   * @throws Error si no se puede crear el directorio (permisos, disco lleno, etc.)
   */
  private async ensureResultsDir(): Promise<void> {
    try {
      await mkdir(this.resultsDir, { recursive: true });
    } catch (error) {
      // Solo ignorar si el directorio ya existe (EEXIST)
      // Cualquier otro error debe propagarse
      if (error && typeof error === 'object' && 'code' in error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'EEXIST') {
          throw new Error(
            `No se pudo crear el directorio de resultados "${this.resultsDir}": ${nodeError.message}`,
            { cause: error }
          );
        }
      } else {
        throw error;
      }
    }
  }
}
