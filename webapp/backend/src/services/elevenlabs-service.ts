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
}

export interface AgentDynamicVariables {
  [key: string]: string;
}

export interface AgentConfig {
  name: string;
  dynamicVariables: AgentDynamicVariables;
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

// Patrón válido para IDs de agentes de ElevenLabs (alfanumérico con guiones/underscores)
const AGENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * Valida que las variables dinámicas tengan el formato esperado
 */
function isValidDynamicVariables(obj: unknown): obj is AgentDynamicVariables {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  return Object.entries(obj).every(([key, value]) =>
    typeof key === 'string' &&
    typeof value === 'string' &&
    key.length < 100 &&
    value.length < 1000
  );
}

/**
 * Obtiene la configuración completa de un agente, incluyendo sus variables dinámicas
 * @param agentId - ID del agente
 * @returns Configuración del agente con nombre y variables dinámicas
 */
export async function getElevenLabsAgentConfig(agentId: string): Promise<AgentConfig> {
  // Validar formato del agentId para prevenir path traversal / injection
  if (!agentId || !AGENT_ID_PATTERN.test(agentId)) {
    console.warn(`[ElevenLabs] agentId inválido: formato no permitido`);
    return { name: '', dynamicVariables: {} };
  }

  console.log(`[ElevenLabs] Obteniendo configuración del agente ${agentId}...`);

  try {
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/convai/agents/${agentId}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      timeout: 30000, // 30 segundos timeout
    });

    const agentData = response.data;
    const name = agentData.name || '';

    // Extraer variables dinámicas de conversation_config.agent.dynamic_variables.dynamic_variable_placeholders
    let dynamicVariables: AgentDynamicVariables = {};

    const placeholders = agentData?.conversation_config?.agent?.dynamic_variables?.dynamic_variable_placeholders;
    if (isValidDynamicVariables(placeholders)) {
      dynamicVariables = placeholders;
    }

    const varCount = Object.keys(dynamicVariables).length;
    console.log(`[ElevenLabs] Agente "${name}" tiene ${varCount} variable(s) dinámica(s)`);

    if (varCount > 0) {
      console.log(`[ElevenLabs] Variables encontradas: ${Object.keys(dynamicVariables).join(', ')}`);
    }

    return {
      name,
      dynamicVariables,
    };
  } catch (error) {
    // Sanitizar error para no exponer API key en logs
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[ElevenLabs] Error obteniendo configuración del agente ${agentId}: ${errorMessage}`);
    // Graceful degradation: retornar objeto vacío en caso de error
    return {
      name: '',
      dynamicVariables: {},
    };
  }
}
