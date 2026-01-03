import { useState, useEffect } from 'react';
import { Building2, Bot, Loader2 } from 'lucide-react';
import type { Organization, ChatAgent } from '../types';
import { getOrganizations, getAgentsByOrganization } from '../services/api';

interface ViernesSelectorProps {
  onSelect: (organizationId: number | null, agentId: number | null) => void;
  disabled?: boolean;
}

export function ViernesSelector({ onSelect, disabled }: ViernesSelectorProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load organizations on mount
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        setLoadingOrgs(true);
        const orgs = await getOrganizations();
        setOrganizations(orgs);
        setError(null);
      } catch (err) {
        setError('Error cargando organizaciones');
        console.error(err);
      } finally {
        setLoadingOrgs(false);
      }
    };
    fetchOrgs();
  }, []);

  // Load agents when organization changes
  useEffect(() => {
    if (!selectedOrgId) {
      setAgents([]);
      setSelectedAgentId(null);
      onSelect(null, null);
      return;
    }

    const fetchAgents = async () => {
      try {
        setLoadingAgents(true);
        const agentList = await getAgentsByOrganization(selectedOrgId);
        setAgents(agentList);
        setSelectedAgentId(null);
        onSelect(selectedOrgId, null);
      } catch (err) {
        setError('Error cargando agentes');
        console.error(err);
      } finally {
        setLoadingAgents(false);
      }
    };
    fetchAgents();
  }, [selectedOrgId]);

  const handleOrgChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedOrgId(value ? parseInt(value, 10) : null);
  };

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const agentId = value ? parseInt(value, 10) : null;
    setSelectedAgentId(agentId);
    onSelect(selectedOrgId, agentId);
  };

  if (loadingOrgs) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Cargando organizaciones...</span>
      </div>
    );
  }

  if (error && organizations.length === 0) {
    return (
      <div className="text-red-400 py-4">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Organization dropdown */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Building2 className="w-4 h-4" />
          Organizacion
        </label>
        <select
          value={selectedOrgId || ''}
          onChange={handleOrgChange}
          disabled={disabled}
          className={`
            w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600
            text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <option value="">Selecciona una organizacion...</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      {/* Agent dropdown */}
      {selectedOrgId && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Bot className="w-4 h-4" />
            Agente
            {loadingAgents && <Loader2 className="w-3 h-3 animate-spin" />}
          </label>
          <select
            value={selectedAgentId || ''}
            onChange={handleAgentChange}
            disabled={disabled || loadingAgents}
            className={`
              w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600
              text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${disabled || loadingAgents ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <option value="">Selecciona un agente...</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          {agents.length === 0 && !loadingAgents && (
            <p className="text-sm text-gray-500">No hay agentes activos para esta organizacion</p>
          )}
        </div>
      )}
    </div>
  );
}
