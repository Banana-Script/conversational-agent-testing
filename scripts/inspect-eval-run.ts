/**
 * Script para inspeccionar un eval run de Vapi y ver los resultados de los judges
 */

import 'dotenv/config';
import { VapiClient } from '@vapi-ai/server-sdk';

async function inspectEvalRun(runId: string) {
  const vapi = new VapiClient({
    token: process.env.VAPI_API_KEY!,
  });

  console.log(`\n🔍 Inspeccionando eval run: ${runId}\n`);

  try {
    // Obtener el eval run completo
    const run = await vapi.eval.evalControllerGetRun({ id: runId });

    console.log('📊 Info del Run:');
    console.log('  Status:', run.status);
    console.log('  Started:', run.startedAt);
    console.log('  Ended:', run.endedAt);
    console.log('  Results count:', run.results?.length || 0);
    console.log('');

    if (!run.results || run.results.length === 0) {
      console.log('❌ No hay resultados en este run');
      return;
    }

    const result = run.results[0];
    console.log('📝 Resultado del Eval:');
    console.log('  Status:', result.status);
    console.log('  Messages count:', result.messages?.length || 0);
    console.log('  Started:', result.startedAt);
    console.log('  Ended:', result.endedAt);
    console.log('');

    console.log('💬 Mensajes del Eval:');
    console.log('');

    if (result.messages) {
      result.messages.forEach((msg: any, index: number) => {
        console.log(`[${index}] Role: ${msg.role}`);

        if (msg.content) {
          const preview = msg.content.length > 100
            ? msg.content.substring(0, 100) + '...'
            : msg.content;
          console.log(`    Content: ${preview}`);
        }

        if (msg.judgePlan) {
          console.log(`    ✓ HAS JUDGE PLAN`);
          console.log(`    Judge type:`, msg.judgePlan.type);
        }

        // Buscar cualquier campo que pueda contener el resultado del judge
        const keys = Object.keys(msg);
        const interestingKeys = keys.filter(k =>
          !['role', 'content', 'judgePlan'].includes(k)
        );

        if (interestingKeys.length > 0) {
          console.log(`    Other fields:`, interestingKeys.join(', '));
          interestingKeys.forEach(key => {
            const value = (msg as any)[key];
            if (value && typeof value === 'object') {
              console.log(`      ${key}:`, JSON.stringify(value, null, 2).substring(0, 200));
            } else {
              console.log(`      ${key}:`, value);
            }
          });
        }

        console.log('');
      });
    }

    // Mostrar el objeto completo del eval run (no solo el resultado)
    console.log('🔬 Estructura completa del EVAL RUN:');
    console.log(JSON.stringify(run, null, 2));

    console.log('\n\n⚠️  Si no ves campos "judge" en los mensajes, es probable que:');
    console.log('   1. Los checkpoints no se ejecutaron correctamente');
    console.log('   2. El assistant de Vapi no respondió');
    console.log('   3. Hay un problema con la estructura del eval que enviamos');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
  }
}

// Ejecutar el script
const runId = process.argv[2];

if (!runId) {
  console.error('❌ Uso: tsx scripts/inspect-eval-run.ts <eval-run-id>');
  console.error('\nEjemplo:');
  console.error('  tsx scripts/inspect-eval-run.ts a2f73b31-56c9-400a-a968-e5d4150109e5');
  process.exit(1);
}

inspectEvalRun(runId);
