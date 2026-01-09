import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, isAbsolute, normalize } from 'path';
import { tmpdir, homedir } from 'os';

/**
 * Tipos para el análisis de severidad
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'incomplete';
export type Confidence = 'high' | 'medium' | 'low';

export interface TestClassification {
  test_name: string;
  severity: Severity;
  confidence?: Confidence;
  rationale: string;
  criteria_passed: string;
  key_issues: string[];
  is_real_bot_issue?: boolean;
  testing_limitation_notes?: string | null;
}

export interface SeverityAnalysis {
  analysis_timestamp: string;
  deployment_status: {
    is_deployable: boolean;
    reason: string;
    confidence?: Confidence;
  };
  summary: {
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    incomplete: number;
    uncertain?: number;
  };
  test_classifications: TestClassification[];
  recommendations: string[];
  testing_notes?: string[];
}

/**
 * Clase para analizar severidad de resultados de pruebas usando Claude CLI
 */
export class SeverityAnalyzer {
  private promptsDir: string;
  private resultsDir: string;

  constructor(promptsDir: string = './prompts', resultsDir: string = './results') {
    // Validar que los paths no estén vacíos
    if (!promptsDir || promptsDir.trim() === '') {
      throw new Error('promptsDir cannot be empty');
    }
    if (!resultsDir || resultsDir.trim() === '') {
      throw new Error('resultsDir cannot be empty');
    }

    // Normalizar y validar paths
    const normalizedPromptsDir = normalize(promptsDir);
    const normalizedResultsDir = normalize(resultsDir);

    // Verificar caracteres peligrosos
    if (normalizedPromptsDir.includes('\0') || normalizedResultsDir.includes('\0')) {
      throw new Error('Invalid characters in directory paths');
    }

    this.promptsDir = normalizedPromptsDir;
    this.resultsDir = normalizedResultsDir;
  }

  /**
   * Analiza los resultados de pruebas y genera clasificación de severidad
   */
  async analyze(resultsJsonPath: string): Promise<SeverityAnalysis> {
    // Validar que el archivo existe
    if (!existsSync(resultsJsonPath)) {
      throw new Error(`Archivo de resultados no encontrado: ${resultsJsonPath}`);
    }

    // Extraer timestamp del nombre del archivo para usarlo en el output
    const timestampMatch = resultsJsonPath.match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z?)/);
    const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString().replace(/[:.]/g, '-');

    // Cargar y preparar el prompt
    const promptPath = join(this.promptsDir, 'analyze-results.md');
    if (!existsSync(promptPath)) {
      throw new Error(`Prompt de análisis no encontrado: ${promptPath}`);
    }

    let promptTemplate = readFileSync(promptPath, 'utf-8');
    promptTemplate = promptTemplate.replace(/\$\{resultsJsonPath\}/g, resultsJsonPath);
    promptTemplate = promptTemplate.replace(/\$\{timestamp\}/g, timestamp);

    // Escribir prompt a archivo temporal
    const tmpFile = join(tmpdir(), `claude-analyze-${Date.now()}.txt`);
    writeFileSync(tmpFile, promptTemplate, 'utf-8');

    try {
      // Ejecutar Claude CLI
      console.log('🔍 Analizando severidad de resultados con Claude...');
      await this.executeClaudeCLI(tmpFile);

      // Buscar el archivo de análisis generado
      const analysisPath = join(this.resultsDir, `severity-analysis-${timestamp}.json`);

      if (!existsSync(analysisPath)) {
        throw new Error(`Claude no generó el archivo de análisis esperado: ${analysisPath}`);
      }

      // Leer y parsear el resultado
      const analysisContent = readFileSync(analysisPath, 'utf-8');
      let analysis: SeverityAnalysis;

      try {
        analysis = JSON.parse(analysisContent) as SeverityAnalysis;
      } catch (parseError) {
        throw new Error(`JSON inválido en archivo de análisis: ${parseError instanceof Error ? parseError.message : 'Error de parsing'}`);
      }

      // Validar estructura mínima requerida
      if (!analysis.analysis_timestamp || !analysis.deployment_status || !analysis.summary) {
        throw new Error('Estructura de análisis inválida: faltan campos requeridos (analysis_timestamp, deployment_status, summary)');
      }

      if (typeof analysis.deployment_status.is_deployable !== 'boolean') {
        throw new Error('Estructura de análisis inválida: deployment_status.is_deployable debe ser boolean');
      }

      console.log('✅ Análisis de severidad completado');
      return analysis;

    } finally {
      // Limpiar archivo temporal
      try {
        unlinkSync(tmpFile);
      } catch {
        // Ignorar errores de limpieza
      }
    }
  }

  /**
   * Valida que una ruta de archivo sea segura
   * @param filePath - Ruta a validar
   * @throws Error si la ruta contiene caracteres peligrosos
   */
  private validatePath(filePath: string): string {
    const normalizedPath = normalize(filePath);

    // Verificar caracteres nulos (path traversal attack)
    if (normalizedPath.includes('\0')) {
      throw new Error('Invalid path: contains null character');
    }

    // Verificar que sea una ruta absoluta
    if (!isAbsolute(normalizedPath)) {
      throw new Error('Path must be absolute');
    }

    return normalizedPath;
  }

  /**
   * Ejecuta Claude CLI con el prompt dado
   * @param promptFile - Ruta al archivo de prompt
   * @param timeoutMs - Timeout en milisegundos (default: 5 minutos)
   */
  private executeClaudeCLI(promptFile: string, timeoutMs: number = 5 * 60 * 1000): Promise<void> {
    // Validar path para prevenir injection
    const safePath = this.validatePath(promptFile);

    return new Promise((resolve, reject) => {
      const claudePath = this.findClaudePath();
      let settled = false; // Flag para evitar race condition

      const child = spawn(claudePath, ['-p', `@${safePath}`, '--dangerously-skip-permissions'], {
        stdio: 'inherit',
        shell: false // Evitar command injection
      });

      // Timeout para evitar que el proceso se cuelgue indefinidamente
      const timeout = setTimeout(() => {
        if (!settled && !child.killed) {
          settled = true;
          child.kill('SIGTERM');
          reject(new Error(`Claude CLI timeout después de ${timeoutMs / 1000} segundos`));
        }
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Claude CLI terminó con código ${code}`));
          }
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error(`Error ejecutando Claude CLI: ${error.message}`));
        }
      });
    });
  }

  /**
   * Encuentra la ruta del ejecutable de Claude CLI
   */
  private findClaudePath(): string {
    const possiblePaths = [
      join(homedir(), '.claude', 'local', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      'claude'
    ];

    for (const path of possiblePaths) {
      if (path === 'claude' || existsSync(path)) {
        return path;
      }
    }

    return 'claude';
  }

  /**
   * Verifica si Claude CLI está disponible
   */
  async isClaudeAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const claudePath = this.findClaudePath();
      let settled = false; // Flag para evitar race condition

      const child = spawn(claudePath, ['--version'], {
        stdio: 'pipe',
        shell: false // Evitar command injection
      });

      // Timeout de 5 segundos
      const timeout = setTimeout(() => {
        if (!settled && !child.killed) {
          settled = true;
          child.kill('SIGTERM');
          resolve(false);
        }
      }, 5000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve(code === 0);
        }
      });

      child.on('error', () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve(false);
        }
      });
    });
  }

  /**
   * Genera un análisis de severidad básico sin usar Claude (fallback)
   * Se usa cuando Claude CLI no está disponible
   */
  generateBasicAnalysis(resultsJsonPath: string): SeverityAnalysis {
    // Leer y parsear JSON con validación
    let resultsContent: string;
    try {
      resultsContent = readFileSync(resultsJsonPath, 'utf-8');
    } catch (readError) {
      throw new Error(`No se pudo leer el archivo de resultados: ${readError instanceof Error ? readError.message : 'Error desconocido'}`);
    }

    let results: {
      total_tests: number;
      successful_tests: number;
      failed_tests: number;
      results: Array<{
        success: boolean;
        test_name: string;
        error?: string;
        timeout_analysis?: {
          configured_timeout_seconds: number;
          configured_max_turns: number;
          elapsed_seconds: number;
          current_turn: number;
          total_turns: number;
        };
        simulation_response?: {
          analysis?: {
            evaluation_criteria_results?: Record<string, {
              result: string;
              criteria_id: string;
              rationale?: string;
            }>;
          };
          simulated_conversation?: Array<{
            role: string;
            message: string;
          }>;
        };
      }>;
    };

    try {
      results = JSON.parse(resultsContent);
    } catch (parseError) {
      throw new Error(`JSON inválido en archivo de resultados: ${parseError instanceof Error ? parseError.message : 'Error de parsing'}`);
    }

    // Validar estructura del JSON
    if (!results.results || !Array.isArray(results.results)) {
      throw new Error('Estructura de resultados inválida: falta array "results"');
    }

    if (typeof results.total_tests !== 'number') {
      throw new Error('Estructura de resultados inválida: falta "total_tests"');
    }

    const failedTests = results.results.filter((r) => !r.success);
    const classifications: TestClassification[] = [];

    let critical = 0, high = 0, medium = 0, low = 0, incomplete = 0;

    for (const test of failedTests) {
      // Validar que el test tenga la estructura esperada
      const evaluationResults = test.simulation_response?.analysis?.evaluation_criteria_results;
      const conversation = test.simulation_response?.simulated_conversation;
      const hasConversation = Array.isArray(conversation) && conversation.length > 0;

      if (!evaluationResults || typeof evaluationResults !== 'object') {
        // Si no hay criterios Y no hay conversación, es INCOMPLETE (no critical)
        if (!hasConversation) {
          classifications.push({
            test_name: test.test_name || 'Test sin nombre',
            severity: 'incomplete',
            confidence: 'high',
            rationale: 'Test no ejecutado: 0/0 criterios y sin conversación (probablemente timeout de infraestructura)',
            criteria_passed: '0/0',
            key_issues: ['test-did-not-run', 'no-conversation', 'infrastructure-timeout'],
            is_real_bot_issue: false,
            testing_limitation_notes: 'El test falló antes de iniciar - requiere re-ejecución para obtener cobertura real'
          });
          incomplete++;
        } else {
          // Si hay conversación pero no criterios, es problema de configuración
          classifications.push({
            test_name: test.test_name || 'Test sin nombre',
            severity: 'critical',
            confidence: 'low',
            rationale: 'No se encontraron criterios de evaluación pero hubo conversación',
            criteria_passed: '0/0',
            key_issues: ['missing-evaluation-criteria'],
            is_real_bot_issue: false,
            testing_limitation_notes: 'Estructura de test incompleta - revisar configuración'
          });
          critical++;
        }
        continue;
      }

      const criteriaResults = Object.values(evaluationResults);

      // Validar que criteriaResults sea un array válido
      if (!Array.isArray(criteriaResults) || criteriaResults.length === 0) {
        // 0/0 criterios con conversación vacía = incomplete
        if (!hasConversation) {
          classifications.push({
            test_name: test.test_name || 'Test sin nombre',
            severity: 'incomplete',
            confidence: 'high',
            rationale: 'Test no ejecutado: array de criterios vacío y sin conversación',
            criteria_passed: '0/0',
            key_issues: ['empty-criteria-array', 'no-conversation'],
            is_real_bot_issue: false,
            testing_limitation_notes: 'El test falló antes de iniciar - requiere re-ejecución'
          });
          incomplete++;
        } else {
          classifications.push({
            test_name: test.test_name || 'Test sin nombre',
            severity: 'medium',
            confidence: 'low',
            rationale: 'Array de criterios vacío pero hubo conversación',
            criteria_passed: '0/0',
            key_issues: ['empty-criteria-array'],
            is_real_bot_issue: false,
            testing_limitation_notes: 'No hay criterios para evaluar'
          });
          medium++;
        }
        continue;
      }

      const passed = criteriaResults.filter((c) => c.result === 'success').length;
      const total = criteriaResults.length;
      const passRate = (passed / total) * 100;

      let severity: Severity;
      if (test.error || passRate === 0) {
        severity = 'critical';
        critical++;
      } else if (passRate <= 25) {
        severity = 'high';
        high++;
      } else if (passRate <= 50) {
        severity = 'medium';
        medium++;
      } else {
        severity = 'low';
        low++;
      }

      const failedCriteria = criteriaResults
        .filter((c) => c.result === 'failure')
        .map((c) => c.criteria_id);

      // Detectar posibles limitaciones de testing
      const hasFrameworkError = criteriaResults.some((c) =>
        c.rationale?.includes('Evaluation failed:') || c.rationale?.includes('Error:')
      );

      // Detectar bucle de despedidas (HIGH severity)
      const farewellPatterns = /\b(adiós|adios|gracias|hasta luego|nos vemos|cuídate|cuidate|chao|bye|hasta pronto|nos hablamos)\b/i;
      let farewellTurns = 0;
      const conversationMessages = conversation || [];

      for (let i = 0; i < conversationMessages.length; i++) {
        const msg = conversationMessages[i];
        if (msg.role === 'user' && farewellPatterns.test(msg.message)) {
          // Contar turnos consecutivos de despedida (user dice adiós, agent responde, user dice adiós de nuevo)
          farewellTurns++;
        }
      }

      const hasFarewellLoop = farewellTurns > 2;

      // Determinar confianza basado en el tipo de fallo
      let confidence: Confidence = 'high';
      let testingLimitationNotes: string | null = null;
      const keyIssues = [...failedCriteria];

      if (hasFrameworkError) {
        confidence = 'medium';
        testingLimitationNotes = 'Posible error técnico del framework de testing';
      }

      // Si hay bucle de despedidas, subir severidad a HIGH
      if (hasFarewellLoop) {
        if (severity === 'low' || severity === 'medium') {
          // Ajustar contadores
          if (severity === 'low') low--;
          if (severity === 'medium') medium--;
          severity = 'high';
          high++;
        }
        keyIssues.push('farewell-loop-detected');
        testingLimitationNotes = testingLimitationNotes
          ? `${testingLimitationNotes}. PROBLEMA REAL: Bucle de despedidas detectado (${farewellTurns} turnos).`
          : `PROBLEMA REAL: Bucle de despedidas detectado - el agente no cierra la conversación apropiadamente (${farewellTurns} turnos de despedida).`;
      }

      classifications.push({
        test_name: test.test_name || 'Test sin nombre',
        severity,
        confidence,
        rationale: hasFarewellLoop
          ? `${passed}/${total} criterios pasados, pero detectado bucle de despedidas (${farewellTurns} turnos) - severidad elevada a HIGH`
          : `${passed}/${total} criterios pasados (${passRate.toFixed(0)}%)`,
        criteria_passed: `${passed}/${total}`,
        key_issues: keyIssues,
        is_real_bot_issue: !hasFrameworkError || hasFarewellLoop,
        testing_limitation_notes: testingLimitationNotes
      });
    }

    // Calcular porcentaje de tests incompletos
    const totalTests = results.total_tests ?? 0;
    const incompletePercentage = totalTests > 0 ? (incomplete / totalTests) * 100 : 0;
    const hasInsufficientCoverage = incompletePercentage > 20;

    // Lógica de despliegue: no desplegable si hay critical/high O si >20% son incomplete
    const isDeployable = critical === 0 && high === 0 && !hasInsufficientCoverage;

    let deploymentReason: string;
    if (critical > 0 || high > 0) {
      deploymentReason = `Hay ${critical} fallos críticos y ${high} fallos altos`;
    } else if (hasInsufficientCoverage) {
      deploymentReason = `Cobertura insuficiente: ${incomplete} tests (${incompletePercentage.toFixed(0)}%) no se ejecutaron (timeouts/sin conversación). Requiere re-ejecución.`;
    } else {
      deploymentReason = 'No hay fallos críticos ni altos, y la cobertura de tests es suficiente';
    }

    return {
      analysis_timestamp: new Date().toISOString(),
      deployment_status: {
        is_deployable: isDeployable,
        reason: deploymentReason,
        confidence: hasInsufficientCoverage ? 'low' : 'high'
      },
      summary: {
        total_tests: totalTests,
        passed_tests: results.successful_tests ?? 0,
        failed_tests: results.failed_tests ?? 0,
        critical,
        high,
        medium,
        low,
        incomplete,
        uncertain: 0
      },
      test_classifications: classifications,
      recommendations: [
        ...this.generateTimeoutOrTurnsRecommendations(results.results),
        'Revisar los criterios fallidos en cada test',
        'Priorizar la corrección de fallos críticos y altos antes del despliegue'
      ],
      testing_notes: [
        'Análisis básico generado sin Claude - para análisis más detallado ejecutar con Claude CLI'
      ]
    };
  }

  /**
   * Genera recomendaciones inteligentes basadas en análisis de timeout/turnos
   * Evalúa si el problema fue de timeout o de turnos y sugiere incrementos específicos
   */
  private generateTimeoutOrTurnsRecommendations(
    tests: Array<{
      test_name: string;
      timeout_analysis?: {
        configured_timeout_seconds: number;
        configured_max_turns: number;
        elapsed_seconds: number;
        current_turn: number;
        total_turns: number;
      };
    }>
  ): string[] {
    const recommendations: string[] = [];

    for (const test of tests) {
      const analysis = test.timeout_analysis;
      if (!analysis) continue;

      const { configured_timeout_seconds, configured_max_turns,
              elapsed_seconds, current_turn, total_turns } = analysis;

      // Evitar división por cero
      if (configured_timeout_seconds <= 0 || total_turns <= 0 || current_turn <= 0) continue;

      const timeoutUsage = elapsed_seconds / configured_timeout_seconds;
      const turnsCompletion = current_turn / total_turns;
      const avgSecsPerTurn = elapsed_seconds / current_turn;
      const estimatedTotal = avgSecsPerTurn * total_turns;

      if (timeoutUsage > 0.9 && turnsCompletion < 1) {
        // Timeout fue el factor limitante
        const suggested = Math.ceil(estimatedTotal * 1.1);
        const pct = Math.round(((suggested / configured_timeout_seconds) - 1) * 100);
        recommendations.push(
          `**Aumentar conversation_timeout** de ${configured_timeout_seconds}s a ${suggested}s (+${pct}%) ` +
          `para "${test.test_name}" - usó ${Math.round(timeoutUsage*100)}% del tiempo, ` +
          `${Math.round(turnsCompletion*100)}% turnos (${current_turn}/${total_turns})`
        );
      } else if (turnsCompletion >= 1 && timeoutUsage < 0.9) {
        // Turnos completados con tiempo de sobra - podría necesitar más turnos
        recommendations.push(
          `Considerar **aumentar max_turns** de ${configured_max_turns} para "${test.test_name}" - ` +
          `completó todos los turnos con ${Math.round(timeoutUsage*100)}% del tiempo disponible`
        );
      } else if (timeoutUsage > 0.9 && Math.abs(timeoutUsage - turnsCompletion) < 0.15) {
        // Tiempo y turnos proporcionales - sugerir ambos
        const sugT = Math.ceil(configured_timeout_seconds * 1.33);
        const sugM = Math.ceil(configured_max_turns * 1.33);
        recommendations.push(
          `Para "${test.test_name}": Aumentar **timeout** a ${sugT}s y **max_turns** a ${sugM} (+33%)`
        );
      }
    }

    return recommendations;
  }

  /**
   * Intenta analizar con Claude, si falla usa análisis básico
   */
  async analyzeWithFallback(resultsJsonPath: string): Promise<SeverityAnalysis> {
    // Verificar primero si Claude está disponible
    const claudeAvailable = await this.isClaudeAvailable();

    if (!claudeAvailable) {
      console.warn('⚠️  Claude CLI no está instalado o no está disponible');
      console.warn('   Usando análisis básico (basado en porcentajes)');
      console.warn('   Para análisis inteligente, instala Claude CLI: https://claude.ai/download');
      return this.generateBasicAnalysis(resultsJsonPath);
    }

    try {
      return await this.analyze(resultsJsonPath);
    } catch (error) {
      console.warn('⚠️  Error al ejecutar Claude CLI, usando análisis básico');
      console.warn(`   Razón: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      return this.generateBasicAnalysis(resultsJsonPath);
    }
  }
}
