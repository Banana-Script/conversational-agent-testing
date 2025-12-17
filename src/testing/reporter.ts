import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { TestResult } from '../types/index.js';
import type { SeverityAnalysis } from './severity-analyzer.js';

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
  async generateMarkdownReport(results: TestResult[], severityAnalysis?: SeverityAnalysis): Promise<string> {
    await this.ensureResultsDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `report-${timestamp}.md`;
    const filepath = join(this.resultsDir, filename);

    let markdown = '# Reporte de Testing de Agentes\n\n';
    markdown += `**Generado:** ${new Date().toLocaleString('es-CO')}\n\n`;
    markdown += `---\n\n`;

    // NUEVA SECCIÓN: Estado de Despliegue (si hay análisis de severidad)
    if (severityAnalysis) {
      markdown += this.generateDeploymentSection(severityAnalysis);
    }

    // Resumen ejecutivo
    markdown += '## 📊 Resumen Ejecutivo\n\n';
    const totalTests = results.length;
    const successfulTests = results.filter((r) => r.success).length;
    const failedTests = totalTests - successfulTests;
    const successRate = totalTests > 0 ? ((successfulTests / totalTests) * 100).toFixed(1) : '0.0';

    markdown += `- **Total de tests ejecutados:** ${totalTests}\n`;
    markdown += `- **Tests exitosos:** ${successfulTests} (${successRate}%)\n`;
    markdown += `- **Tests fallidos:** ${failedTests}\n\n`;

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
    const failed = results.length - successful;
    const successRate = results.length > 0 ? (successful / results.length) * 100 : 0;

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

  /**
   * Genera la sección de estado de despliegue basada en el análisis de severidad
   */
  private generateDeploymentSection(analysis: SeverityAnalysis): string {
    let section = '## 🚦 Estado de Despliegue\n\n';

    const statusEmoji = analysis.deployment_status.is_deployable ? '✅' : '❌';
    const statusText = analysis.deployment_status.is_deployable ? 'DESPLEGABLE' : 'NO DESPLEGABLE';
    const confidenceLabel = this.getConfidenceLabel(analysis.deployment_status.confidence);

    section += `| Indicador | Valor |\n`;
    section += `|-----------|-------|\n`;
    section += `| **Estado** | ${statusEmoji} ${statusText} |\n`;
    section += `| **Razón** | ${analysis.deployment_status.reason} |\n`;
    if (analysis.deployment_status.confidence) {
      section += `| **Confianza** | ${confidenceLabel} |\n`;
    }
    section += '\n';

    // Tabla de severidad
    section += '### Resumen por Severidad\n\n';
    section += '| Severidad | Cantidad |\n';
    section += '|-----------|----------|\n';
    section += `| 🔴 Crítico | ${analysis.summary.critical} |\n`;
    section += `| 🟠 Alto | ${analysis.summary.high} |\n`;
    section += `| 🟡 Medio | ${analysis.summary.medium} |\n`;
    section += `| 🟢 Bajo | ${analysis.summary.low} |\n`;
    if (analysis.summary.incomplete && analysis.summary.incomplete > 0) {
      section += `| ⚪ Incompleto | ${analysis.summary.incomplete} |\n`;
    }
    if (analysis.summary.uncertain && analysis.summary.uncertain > 0) {
      section += `| ❓ Incierto | ${analysis.summary.uncertain} |\n`;
    }
    section += '\n';

    // Tests bloqueantes (críticos y altos)
    const blocking = analysis.test_classifications.filter(
      (t) => t.severity === 'critical' || t.severity === 'high'
    );

    if (blocking.length > 0) {
      section += '### Tests Bloqueantes\n\n';
      for (const test of blocking) {
        const emoji = test.severity === 'critical' ? '🔴' : '🟠';
        const severityLabel = test.severity === 'critical' ? 'Crítico' : 'Alto';
        const confLabel = test.confidence ? ` - Confianza: ${this.getConfidenceLabel(test.confidence)}` : '';
        section += `**${emoji} ${test.test_name}** (${severityLabel}${confLabel})\n`;
        section += `- Criterios: ${test.criteria_passed}\n`;
        section += `- Razón: ${test.rationale}\n`;
        if (test.key_issues && test.key_issues.length > 0) {
          section += `- Problemas clave:\n`;
          for (const issue of test.key_issues) {
            section += `  - ${issue}\n`;
          }
        }
        if (test.testing_limitation_notes) {
          section += `- ⚠️ Nota de testing: ${test.testing_limitation_notes}\n`;
        }
        section += '\n';
      }
    }

    // Tests incompletos (no ejecutaron)
    const incompleteTests = analysis.test_classifications.filter(
      (t) => t.severity === 'incomplete'
    );

    if (incompleteTests.length > 0) {
      const incompletePercentage = analysis.summary.total_tests > 0
        ? ((incompleteTests.length / analysis.summary.total_tests) * 100).toFixed(0)
        : '0';
      section += `### ⚠️ Tests Incompletos (${incompleteTests.length} - ${incompletePercentage}% de cobertura faltante)\n\n`;
      section += `> **ADVERTENCIA**: Estos tests no se ejecutaron correctamente. No hay evidencia del comportamiento del bot en estos escenarios.\n\n`;
      for (const test of incompleteTests) {
        section += `**⚪ ${test.test_name}** (Incompleto)\n`;
        section += `- Criterios: ${test.criteria_passed}\n`;
        section += `- Razón: ${test.rationale}\n`;
        if (test.testing_limitation_notes) {
          section += `- ⚠️ Nota de testing: ${test.testing_limitation_notes}\n`;
        }
        section += '\n';
      }
    }

    // Tests no bloqueantes (medio y bajo)
    const nonBlocking = analysis.test_classifications.filter(
      (t) => t.severity === 'medium' || t.severity === 'low'
    );

    if (nonBlocking.length > 0) {
      section += '### Tests No Bloqueantes\n\n';
      for (const test of nonBlocking) {
        const emoji = test.severity === 'medium' ? '🟡' : '🟢';
        const severityLabel = test.severity === 'medium' ? 'Medio' : 'Bajo';
        section += `**${emoji} ${test.test_name}** (${severityLabel})\n`;
        section += `- Criterios: ${test.criteria_passed}\n`;
        section += `- Razón: ${test.rationale}\n`;
        if (test.testing_limitation_notes) {
          section += `- ⚠️ Nota de testing: ${test.testing_limitation_notes}\n`;
        }
        section += '\n';
      }
    }

    // Recomendaciones
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      section += '### Recomendaciones\n\n';
      for (let i = 0; i < analysis.recommendations.length; i++) {
        section += `${i + 1}. ${analysis.recommendations[i]}\n`;
      }
      section += '\n';
    }

    // Notas de testing
    if (analysis.testing_notes && analysis.testing_notes.length > 0) {
      section += '### Notas de Testing\n\n';
      section += '> Las siguientes notas indican posibles limitaciones del testing automatizado:\n\n';
      for (const note of analysis.testing_notes) {
        section += `- ${note}\n`;
      }
      section += '\n';
    }

    section += '---\n\n';
    return section;
  }

  /**
   * Convierte el nivel de confianza a una etiqueta legible
   */
  private getConfidenceLabel(confidence?: string): string {
    switch (confidence) {
      case 'high': return '🟢 Alta';
      case 'medium': return '🟡 Media';
      case 'low': return '🟠 Baja';
      default: return 'N/A';
    }
  }
}
