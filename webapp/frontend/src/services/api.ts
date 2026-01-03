import type { Provider, GenerateResponse, Organization, ChatAgent, ContextFile, ElevenLabsAgent } from '../types';

const API_BASE = '/api';

export async function uploadFile(file: File): Promise<{ filename: string; content: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

export async function startGeneration(
  files: ContextFile[],
  provider: Provider,
  organizationId?: number | null,
  agentId?: number | string | null,
  testCount?: number
): Promise<GenerateResponse> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files,
      provider,
      contentType: 'specification',
      organizationId: organizationId || undefined,
      agentId: agentId || undefined,
      options: testCount ? { testCount } : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Generation failed');
  }

  return response.json();
}

export async function checkHealth(): Promise<{ status: string; claudeToken: string }> {
  const response = await fetch(`${API_BASE}/../health`);
  return response.json();
}

export function getSSEUrl(jobId: string): string {
  return `${API_BASE}/generate/${jobId}/events`;
}

export function getDownloadUrl(jobId: string): string {
  return `${API_BASE}/generate/${jobId}/download`;
}

export async function getOrganizations(): Promise<Organization[]> {
  const response = await fetch(`${API_BASE}/viernes/organizations`);
  if (!response.ok) {
    throw new Error('Failed to fetch organizations');
  }
  return response.json();
}

export async function getAgentsByOrganization(orgId: number): Promise<ChatAgent[]> {
  const response = await fetch(`${API_BASE}/viernes/agents/${orgId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch agents');
  }
  return response.json();
}

export async function getElevenLabsAgents(forceRefresh = false): Promise<ElevenLabsAgent[]> {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.append('forceRefresh', 'true');
  }

  const url = params.toString() ? `${API_BASE}/elevenlabs/agents?${params}` : `${API_BASE}/elevenlabs/agents`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch ElevenLabs agents');
  }
  return response.json();
}
