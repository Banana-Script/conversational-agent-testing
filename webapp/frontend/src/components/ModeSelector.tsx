import { FileText, Database, Sparkles } from 'lucide-react';

export type JobMode = 'tests-only' | 'rag-only' | 'rag-then-tests';

interface ModeSelectorProps {
  value: JobMode;
  onChange: (mode: JobMode) => void;
  disabled?: boolean;
}

interface ModeOption {
  value: JobMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  recommended?: boolean;
}

const modeOptions: ModeOption[] = [
  {
    value: 'tests-only',
    label: 'Solo Tests',
    description: 'Genera test cases YAML directamente desde los documentos',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    value: 'rag-only',
    label: 'Solo RAG',
    description: 'Extrae una base de conocimiento organizada en Markdown',
    icon: <Database className="w-5 h-5" />,
  },
  {
    value: 'rag-then-tests',
    label: 'RAG + Tests',
    description: 'Primero extrae KB, luego genera tests de alta calidad',
    icon: <Sparkles className="w-5 h-5" />,
    recommended: true,
  },
];

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-300">
        Modo de procesamiento
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {modeOptions.map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all
                ${isSelected
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {option.recommended && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-blue-600 text-white rounded-full">
                  Recomendado
                </span>
              )}

              <div className="flex items-start gap-3">
                <div className={`
                  p-2 rounded-lg
                  ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}
                `}>
                  {option.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                      {option.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                    {option.description}
                  </p>
                </div>

                {/* Radio indicator */}
                <div className={`
                  w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1
                  ${isSelected
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-600'
                  }
                `}>
                  {isSelected && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mode-specific hints */}
      <div className="text-xs text-gray-500">
        {value === 'tests-only' && (
          <p>Soporta archivos de texto (.txt, .md, .json, .yaml). Maximo 1MB/archivo, 5MB total.</p>
        )}
        {value === 'rag-only' && (
          <p>Soporta PDFs, Excel, Word, imagenes y texto. Maximo 10MB/archivo, 50MB total.</p>
        )}
        {value === 'rag-then-tests' && (
          <p>Soporta PDFs, Excel, Word, imagenes y texto. Genera KB organizada + tests de alta calidad.</p>
        )}
      </div>
    </div>
  );
}
