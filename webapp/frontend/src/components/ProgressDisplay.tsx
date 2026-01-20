import { CheckCircle, AlertCircle, Loader2, FileText, Download, BookOpen, Database } from 'lucide-react';
import type { ProgressEvent, Provider } from '../types';

export type JobMode = 'tests-only' | 'rag-only' | 'rag-then-tests';

interface ProgressDisplayProps {
  events: ProgressEvent[];
  status: 'idle' | 'connecting' | 'connected' | 'closed' | 'error';
  downloadUrl: string | null;
  ragDownloadUrl?: string | null;
  totalFiles: number;
  ragTotalFiles?: number;
  provider: Provider;
  agentId?: string | null;
  mode?: JobMode;
}

function getEnvVarsForProvider(provider: Provider, agentId?: string | null): string {
  switch (provider) {
    case 'elevenlabs':
      return `ELEVENLABS_API_KEY=tu_api_key
ELEVENLABS_AGENT_ID=${agentId || 'tu_agent_id'}`;
    case 'vapi':
      return `VAPI_API_KEY=tu_api_key
VAPI_ASSISTANT_ID=tu_assistant_id
OPENAI_API_KEY=tu_openai_key  # Requerido para evaluaciones`;
    case 'viernes':
      return `VIERNES_BASE_URL=https://bot.dev.viernes-for-business.bananascript.io
TEST_PROVIDER=viernes`;
    default:
      return '';
  }
}

export function ProgressDisplay({
  events,
  status,
  downloadUrl,
  ragDownloadUrl,
  totalFiles,
  ragTotalFiles,
  provider,
  agentId,
  mode = 'tests-only'
}: ProgressDisplayProps) {
  if (events.length === 0 && status === 'idle') {
    return null;
  }

  const fileEvents = events.filter((e) => e.type === 'file_created');
  const ragCompletedEvent = events.find((e) => e.type === 'rag_completed');
  const hasError = events.some((e) => e.type === 'error');

  // Determine completion state based on mode
  const isRagOnly = mode === 'rag-only';
  const isRagComplete = ragCompletedEvent !== undefined || ragDownloadUrl;
  const isTestsComplete = downloadUrl !== null;

  const isComplete = status === 'closed' && !hasError && (
    (isRagOnly && isRagComplete) ||
    (!isRagOnly && isTestsComplete)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Progreso</h3>
        {status === 'connected' && (
          <div className="flex items-center gap-2 text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Procesando...</span>
          </div>
        )}
        {isComplete && (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Completado</span>
          </div>
        )}
        {hasError && (
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Error</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {fileEvents.length > 0 && totalFiles > 0 && (
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(fileEvents.length / totalFiles) * 100}%` }}
          />
        </div>
      )}

      {/* Log output */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-64 overflow-y-auto">
        <div className="p-4 space-y-2">
          {events.map((event, index) => (
            <div
              key={index}
              className={`
                text-sm
                ${event.type === 'error' ? 'text-red-400' : ''}
                ${event.type === 'completed' ? 'text-green-400' : ''}
                ${event.type === 'rag_completed' ? 'text-purple-400' : ''}
                ${event.type === 'file_created' ? 'text-blue-400' : ''}
                ${event.type === 'progress' ? 'text-gray-400' : ''}
              `}
            >
              <div className="flex items-start gap-2">
                {event.type === 'file_created' && <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {event.type === 'completed' && <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {event.type === 'rag_completed' && <Database className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {event.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {event.type === 'progress' && <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}

                <span className="flex-1">{event.message}</span>

                <span className="text-xs text-gray-600 flex-shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {event.data?.debugInfo && (
                <details className="ml-6 mt-1">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                    Ver respuesta de Claude
                  </summary>
                  <pre className="mt-1 text-xs bg-gray-900 p-2 rounded overflow-x-auto max-h-40 overflow-y-auto text-gray-500 whitespace-pre-wrap">
                    {event.data.debugInfo}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Files created */}
      {fileEvents.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">
            Archivos generados ({fileEvents.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {fileEvents.map((event, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-sm text-gray-400 bg-gray-900 rounded px-2 py-1"
              >
                <FileText className="w-3 h-3 text-blue-400" />
                <span className="truncate">{event.data?.filename}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Download buttons */}
      {isComplete && (
        <div className="space-y-3">
          {/* RAG Download button */}
          {ragDownloadUrl && (
            <a
              href={ragDownloadUrl}
              download
              className="
                flex items-center justify-center gap-2 w-full
                bg-purple-600 hover:bg-purple-700 text-white
                font-medium py-3 px-4 rounded-lg transition-colors
              "
            >
              <Database className="w-5 h-5" />
              Descargar Base de Conocimiento ({ragTotalFiles || 0} archivos)
            </a>
          )}

          {/* Tests Download button */}
          {downloadUrl && !isRagOnly && (
            <a
              href={downloadUrl}
              download
              className="
                flex items-center justify-center gap-2 w-full
                bg-green-600 hover:bg-green-700 text-white
                font-medium py-3 px-4 rounded-lg transition-colors
              "
            >
              <Download className="w-5 h-5" />
              Descargar Tests ZIP ({totalFiles} tests)
            </a>
          )}
        </div>
      )}

      {/* Next steps guide - only for test modes */}
      {isComplete && downloadUrl && !isRagOnly && (
        <div className="mt-6 bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            Siguientes pasos
          </h4>
          <ol className="text-gray-300 text-sm space-y-3">
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono font-bold">1.</span>
              <span>Descomprime el archivo ZIP descargado</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono font-bold">2.</span>
              <span>
                Copia la carpeta <code className="bg-gray-700 px-1.5 py-0.5 rounded text-blue-300">scenarios/</code> a{' '}
                <code className="bg-gray-700 px-1.5 py-0.5 rounded text-blue-300">tests/scenarios/</code> en tu proyecto
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono font-bold">3.</span>
              <div className="flex-1">
                <span>
                  Configura las variables de entorno en tu{' '}
                  <code className="bg-gray-700 px-1.5 py-0.5 rounded text-blue-300">.env</code>:
                </span>
                <pre className="mt-2 bg-gray-800 p-3 rounded text-xs text-green-300 overflow-x-auto border border-gray-700">
                  {getEnvVarsForProvider(provider, agentId)}
                </pre>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono font-bold">4.</span>
              <div className="flex-1">
                <span>Ejecuta los tests:</span>
                <pre className="mt-2 bg-gray-800 p-3 rounded text-xs text-green-300 overflow-x-auto border border-gray-700">
{`# Ejecutar todos los tests
npm run simulate

# Ejecutar un test específico
npm run simulate -- -f tests/scenarios/nombre-del-test.yaml

# Ver logs detallados
npm run simulate -- --verbose`}
                </pre>
              </div>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
