#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import { ElevenLabsClient } from './api/elevenlabs-client.js';
import { TestRunner } from './testing/test-runner.js';
import { Reporter } from './testing/reporter.js';
import { TestValidationError } from './validation/schemas.js';
import { PathValidationError } from './utils/path-validator.js';
import { getElevenLabsApiKey, handleMissingEnvVar } from './utils/env-validator.js';

// Cargar variables de entorno
config();

const program = new Command();

program
  .name('elevenlabs-testing')
  .description('Framework de testing para agentes de ElevenLabs')
  .version('1.0.0');

/**
 * Comando: simulate
 * Ejecuta tests usando simulación directa (sin guardarlos en ElevenLabs)
 */
program
  .command('simulate')
  .description('Ejecuta tests usando simulación directa')
  .option('-d, --dir <directory>', 'Directorio de tests', './tests/scenarios')
  .option('-o, --output <directory>', 'Directorio de resultados', './results')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🧪 Ejecutando simulaciones...\n'));

    let apiKey: string;
    try {
      apiKey = getElevenLabsApiKey();
    } catch (error) {
      handleMissingEnvVar(error);
    }

    const spinner = ora('Inicializando...').start();

    try {
      const client = new ElevenLabsClient({ apiKey });
      const runner = new TestRunner(client, options.dir);
      const reporter = new Reporter(options.output);

      spinner.text = 'Cargando tests...';
      const tests = await runner.loadAllTests();
      spinner.succeed(`${tests.length} tests cargados`);

      console.log(chalk.cyan('\nEjecutando simulaciones:\n'));

      const allResults = [];

      for (const test of tests) {
        const testSpinner = ora(`Ejecutando "${test.name}"...`).start();

        try {
          const result = await runner.runSimulation(test);
          allResults.push(result);

          const status = result.success ? '✅ Exitoso' : '❌ Fallido';
          const criteriaResults = Object.values(
            result.simulation_response.analysis.evaluation_criteria_results
          );
          const passed = criteriaResults.filter((c) => c.result === 'success').length;
          const total = criteriaResults.length;

          testSpinner.succeed(
            `${status} - "${test.name}" (${passed}/${total} criterios, ${result.execution_time_ms}ms)`
          );
        } catch (error) {
          testSpinner.fail(
            `Error ejecutando "${test.name}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Guardar resultados
      console.log(chalk.cyan('\n💾 Guardando resultados...\n'));
      const resultsPath = await reporter.saveTestResults(allResults);
      const reportPath = await reporter.generateMarkdownReport(allResults);

      console.log(chalk.green(`✓ Resultados guardados en: ${resultsPath}`));
      console.log(chalk.green(`✓ Reporte generado en: ${reportPath}`));

      // Mostrar resumen
      console.log(reporter.generateConsoleSummary(allResults));

      console.log(chalk.green.bold('✅ Simulación completada\n'));
    } catch (error) {
      spinner.fail('Error en la simulación');

      if (error instanceof TestValidationError) {
        console.error(chalk.red('\n❌ Error de validación en archivo YAML:\n'));
        console.error(chalk.yellow(error.message));
      } else if (error instanceof PathValidationError) {
        console.error(chalk.red('\n❌ Error de seguridad:\n'));
        console.error(chalk.yellow(error.message));
      } else {
        console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`));
      }

      process.exit(1);
    }
  });

/**
 * Comando: create
 * Crea tests persistentes en ElevenLabs
 */
program
  .command('create')
  .description('Crea tests persistentes en ElevenLabs')
  .option('-d, --dir <directory>', 'Directorio de tests', './tests/scenarios')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🚀 Creando tests persistentes en ElevenLabs...\n'));

    let apiKey: string;
    try {
      apiKey = getElevenLabsApiKey();
    } catch (error) {
      handleMissingEnvVar(error);
    }

    const spinner = ora('Inicializando...').start();

    try {
      const client = new ElevenLabsClient({ apiKey });
      const runner = new TestRunner(client, options.dir);

      spinner.text = 'Cargando tests...';
      const tests = await runner.loadAllTests();
      spinner.succeed(`${tests.length} tests cargados`);

      console.log(chalk.cyan('\nCreando tests en ElevenLabs:\n'));

      const createdTests = [];

      for (const test of tests) {
        const testSpinner = ora(`Creando "${test.name}"...`).start();

        try {
          const created = await runner.createPersistentTest(test);
          createdTests.push(created);
          testSpinner.succeed(`✓ "${test.name}" creado (ID: ${created.id})`);
        } catch (error) {
          testSpinner.fail(
            `✗ Error creando "${test.name}": ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      console.log(chalk.green.bold(`\n✅ ${createdTests.length} tests creados exitosamente\n`));
      console.log(chalk.cyan('Test IDs:'));
      createdTests.forEach((t) => {
        console.log(chalk.gray(`  - ${t.id}`));
      });
      console.log();

    } catch (error) {
      spinner.fail('Error en la operación');

      if (error instanceof TestValidationError) {
        console.error(chalk.red('\n❌ Error de validación en archivo YAML:\n'));
        console.error(chalk.yellow(error.message));
      } else if (error instanceof PathValidationError) {
        console.error(chalk.red('\n❌ Error de seguridad:\n'));
        console.error(chalk.yellow(error.message));
      } else {
        console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`));
      }

      process.exit(1);
    }
  });

/**
 * Comando: run
 * Ejecuta tests persistentes ya creados en ElevenLabs
 */
program
  .command('run')
  .description('Ejecuta tests persistentes de ElevenLabs')
  .requiredOption('-a, --agent <agent-id>', 'ID del agente')
  .requiredOption('-t, --tests <test-ids...>', 'IDs de tests a ejecutar')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n▶️  Ejecutando tests persistentes...\n'));

    let apiKey: string;
    try {
      apiKey = getElevenLabsApiKey();
    } catch (error) {
      handleMissingEnvVar(error);
    }

    const spinner = ora('Ejecutando tests...').start();

    try {
      const client = new ElevenLabsClient({ apiKey });
      const runner = new TestRunner(client);

      const result = await runner.runPersistentTests(options.agent, options.tests);

      spinner.succeed('Tests ejecutados');

      console.log(chalk.cyan('\n✅ Suite de tests iniciada:\n'));
      console.log(chalk.gray(`  Suite ID: ${result.id}`));
      console.log(chalk.gray(`  Agent ID: ${result.agent_id}`));
      console.log(chalk.gray(`  Created: ${new Date(result.created_at * 1000).toLocaleString()}`));
      console.log(chalk.cyan(`\n📊 Tests ejecutándose (${result.test_runs.length}):\n`));

      result.test_runs.forEach((testRun) => {
        const status =
          testRun.status === 'passed'
            ? chalk.green('✅ Passed')
            : testRun.status === 'failed'
              ? chalk.red('❌ Failed')
              : testRun.status === 'running'
                ? chalk.blue('🔄 Running')
                : chalk.yellow('⏳ Pending');
        console.log(chalk.gray(`  ${testRun.test_name}`));
        console.log(chalk.gray(`    Test ID: ${testRun.test_id}`));
        console.log(chalk.gray(`    Run ID: ${testRun.test_run_id}`));
        console.log(`    Status: ${status}`);
        console.log();
      });

      console.log(chalk.yellow('💡 Los tests están ejecutándose de forma asíncrona.'));
      console.log(chalk.yellow(`   Puedes consultar el estado en el dashboard de ElevenLabs.`));
      console.log();

    } catch (error) {
      spinner.fail('Error ejecutando tests');
      console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

/**
 * Comando: list
 * Lista tests persistentes
 */
program
  .command('list')
  .description('Lista todos los tests persistentes')
  .option('-s, --search <query>', 'Buscar tests por nombre')
  .option('-p, --page-size <size>', 'Cantidad de tests por página', '30')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📋 Listando tests...\n'));

    let apiKey: string;
    try {
      apiKey = getElevenLabsApiKey();
    } catch (error) {
      handleMissingEnvVar(error);
    }

    const spinner = ora('Obteniendo tests...').start();

    try {
      const client = new ElevenLabsClient({ apiKey });
      const tests = await client.listPersistentTests(
        options.search,
        parseInt(options.pageSize)
      );

      spinner.succeed(`${tests.tests.length} tests encontrados`);

      if (tests.tests.length === 0) {
        console.log(chalk.yellow('\n  No hay tests creados para este agente.\n'));
        return;
      }

      console.log(chalk.cyan('\nTests:\n'));
      tests.tests.forEach((test) => {
        console.log(chalk.white(`  📝 ${test.name}`));
        console.log(chalk.gray(`     ID: ${test.id}`));
        console.log(chalk.gray(`     Type: ${test.type || 'llm'}`));
        console.log();
      });

    } catch (error) {
      spinner.fail('Error listando tests');
      console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

/**
 * Comando: report
 * Genera reporte desde resultados existentes
 */
program
  .command('report')
  .description('Genera reporte desde resultados guardados')
  .argument('<results-file>', 'Archivo JSON con resultados')
  .action(async (resultsFile) => {
    console.log(chalk.blue.bold('\n📄 Generando reporte...\n'));

    try {
      const { readFile } = await import('fs/promises');
      const content = await readFile(resultsFile, 'utf-8');
      const data = JSON.parse(content);

      const reporter = new Reporter();
      const reportPath = await reporter.generateMarkdownReport(data.results);

      console.log(chalk.green(`✓ Reporte generado en: ${reportPath}\n`));
    } catch (error) {
      console.error(
        chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`)
      );
      process.exit(1);
    }
  });

/**
 * Comando: copy-agent
 * Copia la configuración de un agente a otro
 */
program
  .command('copy-agent')
  .description('Copia la configuración de un agente origen a un agente destino')
  .requiredOption('-s, --source <agent-id>', 'ID del agente origen')
  .requiredOption('-d, --destination <agent-id>', 'ID del agente destino')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📋 Copiando configuración entre agentes...\n'));

    let apiKey: string;
    try {
      apiKey = getElevenLabsApiKey();
    } catch (error) {
      handleMissingEnvVar(error);
    }

    const spinner = ora('Descargando configuración del agente origen...').start();

    try {
      const client = new ElevenLabsClient({ apiKey });

      // 1. Obtener configuración del agente origen
      spinner.text = `Descargando configuración del agente origen (${options.source})...`;
      const sourceConfig = await client.getAgent(options.source);
      spinner.succeed(`Configuración del agente origen descargada`);

      console.log(chalk.cyan('\n📥 Agente origen:\n'));
      console.log(chalk.gray(`  Nombre: ${sourceConfig.name || 'N/A'}`));
      console.log(chalk.gray(`  ID: ${sourceConfig.agent_id || options.source}`));

      // 2. Actualizar agente destino con la configuración del origen
      const updateSpinner = ora(`Actualizando agente destino (${options.destination})...`).start();

      // Crear una copia limpia de la configuración sin campos de solo lectura
      const configToUpdate = {
        name: sourceConfig.name,
        conversation_config: sourceConfig.conversation_config,
        platform_settings: sourceConfig.platform_settings,
        secrets: sourceConfig.secrets,
      };

      const updatedAgent = await client.updateAgent(options.destination, configToUpdate);
      updateSpinner.succeed(`Agente destino actualizado exitosamente`);

      console.log(chalk.cyan('\n📤 Agente destino:\n'));
      console.log(chalk.gray(`  Nombre: ${updatedAgent.name || 'N/A'}`));
      console.log(chalk.gray(`  ID: ${updatedAgent.agent_id || options.destination}`));

      console.log(chalk.green.bold('\n✅ Configuración copiada exitosamente\n'));

    } catch (error) {
      spinner.fail('Error copiando configuración');
      console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

/**
 * Comando: download-agent
 * Descarga la configuración completa de un agente/assistant
 */
program
  .command('download-agent')
  .description('Descarga la configuración completa de un agente/assistant')
  .option('-a, --agent <agent-id>', 'ID del agente/assistant a descargar')
  .option('-o, --output <directory>', 'Directorio de salida', './agents')
  .option('-p, --provider <provider>', 'Provider: elevenlabs o vapi')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n📥 Descargando configuración del agente...\n'));

    // Determinar provider desde CLI o env
    const provider = (options.provider || process.env.TEST_PROVIDER || 'elevenlabs').toLowerCase();

    if (provider !== 'elevenlabs' && provider !== 'vapi') {
      console.error(chalk.red(`❌ Error: Provider inválido "${provider}"`));
      console.error(chalk.yellow('💡 Usa: elevenlabs o vapi\n'));
      process.exit(1);
    }

    // Si no se especifica el agent ID, usar el del .env según provider
    let agentId: string;
    if (provider === 'vapi') {
      agentId = options.agent || process.env.VAPI_ASSISTANT_ID || '';
    } else {
      agentId = options.agent || process.env.ELEVENLABS_AGENT_ID || '';
    }

    // Validar que el agent ID no esté vacío
    if (!agentId || agentId.trim() === '') {
      console.error(chalk.red('❌ Error: El ID del agente/assistant está vacío'));
      console.error(chalk.yellow('\n💡 Asegúrate de:'));
      if (provider === 'vapi') {
        console.error(chalk.yellow('   1. Tener VAPI_ASSISTANT_ID configurado en .env'));
        console.error(chalk.yellow('   2. O usar: npm run download -- --provider vapi --agent <id>\n'));
      } else {
        console.error(chalk.yellow('   1. Tener ELEVENLABS_AGENT_ID configurado en .env'));
        console.error(chalk.yellow('   2. O usar: npm run download -- --agent <id>\n'));
      }
      process.exit(1);
    }

    const spinner = ora('Limpiando carpeta de destino...').start();

    try {
      // Limpiar carpeta de destino antes de descargar
      const { rm, mkdir } = await import('fs/promises');
      try {
        await rm(options.output, { recursive: true, force: true });
      } catch (error) {
        // Ignorar si la carpeta no existe
      }
      await mkdir(options.output, { recursive: true });
      spinner.succeed('Carpeta limpiada');

      spinner.start(`Obteniendo configuración del ${provider} ${provider === 'vapi' ? 'assistant' : 'agent'}...`);

      let agentConfig: any;

      if (provider === 'vapi') {
        // Usar Vapi
        const { VapiClient } = await import('./api/vapi-client.js');

        const apiKey = process.env.VAPI_API_KEY;
        if (!apiKey) {
          spinner.fail();
          console.error(chalk.red('❌ Error: VAPI_API_KEY no configurado en .env\n'));
          process.exit(1);
        }

        const client = new VapiClient({ apiKey });
        spinner.text = 'Descargando configuración del assistant...';
        agentConfig = await client.getAssistant(agentId);
      } else {
        // Usar ElevenLabs
        let apiKey: string;
        try {
          apiKey = getElevenLabsApiKey();
        } catch (error) {
          handleMissingEnvVar(error);
        }

        const client = new ElevenLabsClient({ apiKey });
        spinner.text = 'Descargando configuración del agente...';
        agentConfig = await client.getAgent(agentId);
      }

      spinner.succeed('Configuración descargada');

      // Importar writeFile para guardar archivos
      const { writeFile } = await import('fs/promises');

      // Generar nombres de archivo
      const filename = `${agentId}.json`;
      const filepath = `${options.output}/${filename}`;

      // Extraer el prompt a un archivo separado
      let promptPath = null;
      let modifiedConfig = { ...agentConfig };

      if (provider === 'elevenlabs') {
        // ElevenLabs: prompt en conversation_config.agent.prompt.prompt
        if (
          agentConfig.conversation_config?.agent?.prompt?.prompt &&
          typeof agentConfig.conversation_config.agent.prompt.prompt === 'string'
        ) {
          const promptContent = agentConfig.conversation_config.agent.prompt.prompt;
          const promptFilename = `${agentId}.md`;
          promptPath = `${options.output}/${promptFilename}`;

          // Guardar prompt en archivo markdown
          await writeFile(promptPath, promptContent, 'utf-8');

          // Modificar la configuración para que referencie el archivo
          modifiedConfig = {
            ...agentConfig,
            conversation_config: {
              ...agentConfig.conversation_config,
              agent: {
                ...agentConfig.conversation_config.agent,
                prompt: {
                  ...agentConfig.conversation_config.agent.prompt,
                  prompt: `[PROMPT_EXTRAIDO] Ver archivo: ${promptFilename}`,
                },
              },
            },
          };
        }
      } else if (provider === 'vapi') {
        // Vapi: prompt en model.messages array (role: system)
        if (agentConfig.model?.messages && Array.isArray(agentConfig.model.messages)) {
          const systemMessage = agentConfig.model.messages.find((msg: any) => msg.role === 'system');
          if (systemMessage && typeof systemMessage.content === 'string') {
            const promptContent = systemMessage.content;
            const promptFilename = `${agentId}.md`;
            promptPath = `${options.output}/${promptFilename}`;

            // Guardar prompt en archivo markdown
            await writeFile(promptPath, promptContent, 'utf-8');

            // Modificar la configuración para que referencie el archivo
            modifiedConfig = {
              ...agentConfig,
              model: {
                ...agentConfig.model,
                messages: agentConfig.model.messages.map((msg: any) => {
                  if (msg.role === 'system') {
                    return {
                      ...msg,
                      content: `[PROMPT_EXTRAIDO] Ver archivo: ${promptFilename}`,
                    };
                  }
                  return msg;
                }),
              },
            };
          }
        }
      }

      // Guardar configuración
      await writeFile(filepath, JSON.stringify(modifiedConfig, null, 2), 'utf-8');

      spinner.succeed('Configuración descargada exitosamente');

      console.log(chalk.green(`\n✓ Configuración guardada en: ${filepath}`));
      if (promptPath) {
        console.log(chalk.green(`✓ Prompt extraído en: ${promptPath}`));
      }
      console.log(chalk.cyan(`\n📋 Resumen del ${provider === 'vapi' ? 'assistant' : 'agente'}:\n`));
      console.log(chalk.gray(`  Nombre: ${agentConfig.name || 'N/A'}`));
      console.log(chalk.gray(`  ID: ${agentConfig.agent_id || agentConfig.id || agentId}`));
      console.log(chalk.gray(`  Provider: ${provider}`));
      console.log(chalk.gray(`  Timestamp: ${new Date().toLocaleString()}`));
      console.log();

    } catch (error) {
      spinner.fail('Error descargando configuración');
      console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

// Parsear argumentos
program.parse();
