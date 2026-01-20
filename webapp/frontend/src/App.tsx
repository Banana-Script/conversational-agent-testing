import { useState } from 'react';
import { Sparkles, AlertCircle, HelpCircle } from 'lucide-react';
import { FileUploader, type ContextFile } from './components/FileUploader';
import { ProviderSelector } from './components/ProviderSelector';
import { ViernesSelector } from './components/ViernesSelector';
import { ElevenLabsSelector } from './components/ElevenLabsSelector';
import { ModeSelector } from './components/ModeSelector';
import { ProgressDisplay } from './components/ProgressDisplay';
import { HelpModal } from './components/HelpModal';
import { useSSE } from './hooks/useSSE';
import { startGeneration, getSSEUrl } from './services/api';
import type { Provider, JobMode } from './types';

function App() {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [provider, setProvider] = useState<Provider>('viernes');
  const [mode, setMode] = useState<JobMode>('tests-only');
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedElevenLabsAgentId, setSelectedElevenLabsAgentId] = useState<string | null>(null);
  const [testCount, setTestCount] = useState<number | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const { events, status, downloadUrl, ragDownloadUrl, totalFiles, ragTotalFiles, connect, reset } = useSSE();

  const handleFilesChange = (newFiles: ContextFile[]) => {
    setFiles(newFiles);
    setError(null);
  };

  const handleViernesSelect = (orgId: number | null, agentId: number | null) => {
    setSelectedOrgId(orgId);
    setSelectedAgentId(agentId);
  };

  const handleGenerate = async () => {
    if (files.length === 0) {
      setError('Por favor sube al menos un archivo');
      return;
    }

    // Validate Viernes selection (not required for rag-only mode)
    if (mode !== 'rag-only' && provider === 'viernes' && (!selectedOrgId || !selectedAgentId)) {
      setError('Por favor selecciona una organizacion y un agente');
      return;
    }

    // Validate ElevenLabs selection (not required for rag-only mode)
    if (mode !== 'rag-only' && provider === 'elevenlabs' && !selectedElevenLabsAgentId) {
      setError('Por favor selecciona un agente de ElevenLabs');
      return;
    }

    setIsGenerating(true);
    setError(null);
    reset();

    try {
      // Determinar qué agentId pasar según el provider
      const agentId = provider === 'viernes' ? selectedAgentId :
                      provider === 'elevenlabs' ? selectedElevenLabsAgentId :
                      null;

      const response = await startGeneration(files, provider, selectedOrgId, agentId, testCount, mode);
      connect(getSSEUrl(response.jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar generacion');
      setIsGenerating(false);
    }
  };

  const handleNewGeneration = () => {
    setIsGenerating(false);
    reset();
  };

  const isComplete = status === 'closed' && (downloadUrl || ragDownloadUrl);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {mode === 'rag-only' ? 'RAG Knowledge Base' : 'Test Generator'}
                </h1>
                <p className="text-gray-400 text-sm">
                  {mode === 'rag-only'
                    ? 'Extrae una base de conocimiento estructurada con IA'
                    : 'Genera test cases automaticamente con IA'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Ayuda"
            >
              <HelpCircle className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Configuration section */}
          <section className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-6">Configuracion</h2>

            <div className="space-y-6">
              <ModeSelector
                value={mode}
                onChange={setMode}
                disabled={isGenerating && !isComplete}
              />

              <FileUploader
                onFilesChange={handleFilesChange}
                onHelpClick={() => setIsHelpModalOpen(true)}
                disabled={isGenerating && !isComplete}
                mode={mode}
              />

              {/* Provider and agent selection - hidden for rag-only mode */}
              {mode !== 'rag-only' && (
                <>
                  <ProviderSelector
                    value={provider}
                    onChange={setProvider}
                    disabled={isGenerating && !isComplete}
                  />

                  {provider === 'viernes' && (
                    <ViernesSelector
                      onSelect={handleViernesSelect}
                      disabled={isGenerating && !isComplete}
                    />
                  )}

                  {provider === 'elevenlabs' && (
                    <ElevenLabsSelector
                      onSelect={setSelectedElevenLabsAgentId}
                      disabled={isGenerating && !isComplete}
                    />
                  )}

                  <div>
                    <label htmlFor="testCount" className="block text-sm font-medium text-gray-300 mb-2">
                      Número de tests (opcional)
                    </label>
                    <input
                      type="number"
                      id="testCount"
                      min="1"
                      max="50"
                      value={testCount || ''}
                      onChange={(e) => setTestCount(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Dejar vacío para que Claude decida"
                      disabled={isGenerating && !isComplete}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Si se deja vacío, Claude generará entre 15-25 tests
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Error message */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* Generate button */}
          {!isGenerating && (
            <button
              onClick={handleGenerate}
              disabled={
                files.length === 0 ||
                (mode !== 'rag-only' && provider === 'viernes' && (!selectedOrgId || !selectedAgentId)) ||
                (mode !== 'rag-only' && provider === 'elevenlabs' && !selectedElevenLabsAgentId)
              }
              className={`
                w-full py-4 px-6 rounded-lg font-medium text-lg
                transition-all flex items-center justify-center gap-2
                ${files.length > 0 &&
                  (mode === 'rag-only' ||
                   provider === 'vapi' ||
                   (provider === 'viernes' && selectedOrgId && selectedAgentId) ||
                   (provider === 'elevenlabs' && selectedElevenLabsAgentId))
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              <Sparkles className="w-5 h-5" />
              {mode === 'rag-only' ? 'Extraer Knowledge Base' : 'Generar Test Cases'}
            </button>
          )}

          {/* Progress section */}
          {(isGenerating || events.length > 0) && (
            <section className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <ProgressDisplay
                events={events}
                status={status}
                downloadUrl={downloadUrl}
                ragDownloadUrl={ragDownloadUrl}
                totalFiles={totalFiles}
                ragTotalFiles={ragTotalFiles}
                provider={provider}
                agentId={provider === 'elevenlabs' ? selectedElevenLabsAgentId : null}
                mode={mode}
              />

              {isComplete && (
                <button
                  onClick={handleNewGeneration}
                  className="mt-4 w-full py-3 px-4 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Nueva generacion
                </button>
              )}
            </section>
          )}

          {/* Help section */}
          <section className="text-center text-gray-500 text-sm">
            <p>
              {mode === 'rag-only' ? (
                <>
                  Sube documentos (PDF, Word, Excel, imágenes) con información del negocio.
                  <br />
                  El sistema extraerá una base de conocimiento estructurada en Markdown.
                </>
              ) : (
                <>
                  Sube un archivo con el prompt del agente o especificaciones de negocio.
                  <br />
                  El sistema generara tests YAML compatibles con el framework de testing.
                </>
              )}
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 mt-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-gray-600 text-sm">
          Test Generator Web App - Powered by Claude Code
        </div>
      </footer>

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </div>
  );
}

export default App;
