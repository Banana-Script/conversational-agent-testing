import { CheckCircle, AlertCircle, Loader2, FileText, Download } from 'lucide-react';
import type { ProgressEvent } from '../types';

interface ProgressDisplayProps {
  events: ProgressEvent[];
  status: 'idle' | 'connecting' | 'connected' | 'closed' | 'error';
  downloadUrl: string | null;
  totalFiles: number;
}

export function ProgressDisplay({ events, status, downloadUrl, totalFiles }: ProgressDisplayProps) {
  if (events.length === 0 && status === 'idle') {
    return null;
  }

  const fileEvents = events.filter((e) => e.type === 'file_created');
  const hasError = events.some((e) => e.type === 'error');
  const isComplete = status === 'closed' && !hasError && downloadUrl;

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
                flex items-start gap-2 text-sm
                ${event.type === 'error' ? 'text-red-400' : ''}
                ${event.type === 'completed' ? 'text-green-400' : ''}
                ${event.type === 'file_created' ? 'text-blue-400' : ''}
                ${event.type === 'progress' ? 'text-gray-400' : ''}
              `}
            >
              {event.type === 'file_created' && <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {event.type === 'completed' && <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {event.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {event.type === 'progress' && <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5" />}

              <span className="flex-1">{event.message}</span>

              <span className="text-xs text-gray-600 flex-shrink-0">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
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

      {/* Download button */}
      {isComplete && downloadUrl && (
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
          Descargar ZIP ({totalFiles} tests)
        </a>
      )}
    </div>
  );
}
