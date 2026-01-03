import axios from 'axios';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

if (!ELEVENLABS_API_KEY) {
  console.warn('[ElevenLabs] ELEVENLABS_API_KEY no configurada en variables de entorno');
}

// Caché en memoria
let cachedAgents: ElevenLabsAgent[] | null = null;
let lastFetchTime: number | null = null;

export interface ElevenLabsAgent {
  agent_id: string;
  name: string;
  created_at?: string;
  // Agregar más campos según necesidad
}

export async function getElevenLabsAgents(forceRefresh = false): Promise<ElevenLabsAgent[]> {
  // Si hay caché y no es force refresh, retornar caché
  if (cachedAgents && !forceRefresh) {
    console.log(`[ElevenLabs] Retornando ${cachedAgents.length} agentes desde caché`);
    return cachedAgents;
  }

  console.log('[ElevenLabs] Cargando agentes desde API...');
  const allAgents: ElevenLabsAgent[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  let pageCount = 0;

  // Iterar todas las páginas
  while (hasMore) {
    pageCount++;
    const params: any = {
      page_size: 100, // Máximo permitido
      show_only_owned_agents: false, // Incluir agentes compartidos
      archived: false, // Excluir archivados
    };

    if (cursor) {
      params.cursor = cursor;
    }

    const response = await axios.get(`${ELEVENLABS_BASE_URL}/convai/agents`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      params,
    });

    const agents = response.data.agents || [];
    allAgents.push(...agents);

    // Paginación con cursor
    hasMore = response.data.has_more || false;
    cursor = response.data.next_cursor || null;

    console.log(`[ElevenLabs] Página ${pageCount}: ${agents.length} agentes (total: ${allAgents.length}, has_more: ${hasMore})`);
  }

  cachedAgents = allAgents;
  lastFetchTime = Date.now();
  console.log(`[ElevenLabs] Caché actualizado con ${allAgents.length} agentes`);

  return allAgents;
}
