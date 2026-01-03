import { useState, useEffect } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { getElevenLabsAgents } from '../services/api';
import type { ElevenLabsAgent } from '../types';

interface ElevenLabsSelectorProps {
  onSelect: (agentId: string | null) => void;
  disabled?: boolean;
}

export function ElevenLabsSelector({ onSelect, disabled }: ElevenLabsSelectorProps) {
  const [agents, setAgents] = useState<ElevenLabsAgent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<ElevenLabsAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga inicial
  useEffect(() => {
    loadAgents(false);
  }, []);

  // Filtro local cuando cambia el search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredAgents(agents);
    } else {
      const filtered = agents.filter(agent =>
        agent.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredAgents(filtered);
    }
  }, [searchQuery, agents]);

  const loadAgents = async (forceRefresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getElevenLabsAgents(forceRefresh);
      setAgents(data);
      setFilteredAgents(data);
    } catch (err) {
      setError('Error al cargar agentes de ElevenLabs');
      console.error('Error loading ElevenLabs agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentChange = (agentId: string) => {
    const newAgentId = agentId || null;
    setSelectedAgentId(newAgentId);
    onSelect(newAgentId);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Agente de ElevenLabs
        </label>

        {/* Botón de force refresh */}
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => loadAgents(true)}
            disabled={loading || disabled}
            className="flex items-center gap-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Cargando...' : 'Recargar agentes'}
          </button>
          {agents.length > 0 && !loading && (
            <span className="flex items-center text-sm text-gray-400">
              {agents.length} agentes cargados
            </span>
          )}
        </div>

        {/* Input de búsqueda */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar agente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={loading || disabled || agents.length === 0}
            className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Dropdown de agentes */}
        <select
          value={selectedAgentId || ''}
          onChange={(e) => handleAgentChange(e.target.value)}
          disabled={loading || disabled || filteredAgents.length === 0}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">
            {loading
              ? 'Cargando agentes...'
              : filteredAgents.length === 0 && searchQuery
              ? 'No se encontraron agentes'
              : 'Selecciona un agente'}
          </option>
          {filteredAgents.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agent.name}
            </option>
          ))}
        </select>

        {/* Estados de carga/error */}
        {error && (
          <p className="text-red-400 text-sm mt-2">{error}</p>
        )}

        {searchQuery && filteredAgents.length > 0 && (
          <p className="text-gray-500 text-xs mt-1">
            Mostrando {filteredAgents.length} de {agents.length} agentes
          </p>
        )}
      </div>
    </div>
  );
}
