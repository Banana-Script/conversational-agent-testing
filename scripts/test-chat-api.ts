/**
 * Script para probar el Chat API de Vapi con conversaciones multi-turno
 */

import 'dotenv/config';
import { VapiClient } from '../src/api/vapi-client.js';

async function testChatAPI() {
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!assistantId) {
    console.error('Error: VAPI_ASSISTANT_ID no está configurado en .env');
    process.exit(1);
  }

  const client = new VapiClient({
    apiKey: process.env.VAPI_API_KEY!,
    assistantId,
  });

  console.log('\n🧪 Testing Vapi Chat API for Multi-Turn Conversations\n');
  console.log('===============================================\n');

  // Mensajes de prueba del usuario
  const userMessages = [
    'Sí, habla Juan Pérez',
    'Es para uso personal, tengo un carro en Bogotá',
    'Es un Renault Logan 2016',
    'Solo tengo ese vehículo y no soy cliente actual',
    'Me interesa conocer más sobre detéKtor GPS y El Cazador',
  ];

  try {
    const result = await client.runMultiTurnConversation(
      assistantId,
      userMessages,
      { name: 'Test Multi-Turn' }
    );

    console.log('\n✅ Conversación completada exitosamente!\n');
    console.log(`📊 Estadísticas:`);
    console.log(`  - Turnos: ${result.chats.length}`);
    console.log(`  - Mensajes totales: ${result.fullConversation.length}`);
    console.log(`  - Costo total: $${result.totalCost.toFixed(4)}\n`);

    console.log('💬 Conversación completa:\n');
    console.log('===============================================\n');

    result.fullConversation.forEach((msg, idx) => {
      const prefix = msg.role === 'user' ? '👤 USER' : '🤖 ASSISTANT';
      const content = msg.content.substring(0, 200);
      console.log(`${prefix}: ${content}${msg.content.length > 200 ? '...' : ''}\n`);
    });

    console.log('===============================================\n');
    console.log(`✅ Total de ${result.fullConversation.length} mensajes en la conversación`);
    console.log(`✅ Conversación multi-turno funcionó perfectamente!\n`);

  } catch (error: any) {
    console.error('\n❌ Error ejecutando conversación:', error.message);
    if (error.details) {
      console.error('Detalles:', JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }
}

testChatAPI();
