import { useCallback, useState } from 'react';
import { Upload, FileText, X, Plus, HelpCircle } from 'lucide-react';

export interface ContextFile {
  name: string;
  content: string;
}

interface FileUploaderProps {
  onFilesChange: (files: ContextFile[]) => void;
  onHelpClick?: () => void;
  disabled?: boolean;
}

const VALID_EXTENSIONS = ['.txt', '.md', '.json', '.yaml', '.yml'];
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB

export function FileUploader({ onFilesChange, onHelpClick, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getTotalSize = (fileList: ContextFile[]): number => {
    return fileList.reduce((sum, f) => sum + f.content.length, 0);
  };

  const validateFile = (file: File, currentFiles: ContextFile[]): string | null => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!VALID_EXTENSIONS.includes(ext)) {
      return `Extension no permitida: ${ext}. Permitidas: ${VALID_EXTENSIONS.join(', ')}`;
    }

    if (file.size > MAX_FILE_SIZE) {
      return `${file.name} excede el limite de 1MB`;
    }

    // Check for duplicates
    if (currentFiles.some(f => f.name === file.name)) {
      return `Ya existe un archivo con nombre: ${file.name}`;
    }

    // Check total size
    const newTotal = getTotalSize(currentFiles) + file.size;
    if (newTotal > MAX_TOTAL_SIZE) {
      return 'El tamaño total excede el limite de 5MB';
    }

    return null;
  };

  const processFiles = async (fileList: FileList) => {
    setError(null);
    const newFiles: ContextFile[] = [];
    let currentFiles = [...files];

    for (const file of Array.from(fileList)) {
      const validationError = validateFile(file, currentFiles);
      if (validationError) {
        setError(validationError);
        continue;
      }

      const content = await file.text();
      const newFile = { name: file.name, content };
      newFiles.push(newFile);
      currentFiles.push(newFile);
    }

    if (newFiles.length > 0) {
      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      onFilesChange(updatedFiles);
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer.files.length > 0) {
        await processFiles(e.dataTransfer.files);
      }
    },
    [files, onFilesChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
    // Reset input to allow selecting the same file again
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
    setError(null);
  };

  const clearAllFiles = () => {
    setFiles([]);
    onFilesChange([]);
    setError(null);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-gray-300">
            Archivos de contexto
          </label>
          {onHelpClick && (
            <button
              onClick={onHelpClick}
              type="button"
              className="text-blue-400 hover:text-blue-300 transition-colors"
              title="¿Qué archivos subir?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        {files.length > 0 && (
          <button
            onClick={clearAllFiles}
            disabled={disabled}
            className="text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {/* Lista de archivos seleccionados */}
      {files.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-sm truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {formatSize(file.content.length)}
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={disabled}
                  className="p-1 hover:bg-gray-700 rounded disabled:opacity-50 flex-shrink-0"
                  title="Eliminar archivo"
                >
                  <X className="w-4 h-4 text-gray-400 hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500 pt-2 border-t border-gray-700">
            <span>{files.length} archivo{files.length !== 1 ? 's' : ''}</span>
            <span>Total: {formatSize(getTotalSize(files))}</span>
          </div>
        </div>
      )}

      {/* Zona de drop/agregar archivos */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          type="file"
          accept={VALID_EXTENSIONS.join(',')}
          onChange={handleFileSelect}
          disabled={disabled}
          className="hidden"
          id="file-upload"
          multiple
        />
        <label
          htmlFor="file-upload"
          className={`cursor-pointer ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {files.length > 0 ? (
            <>
              <Plus className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-300 text-sm">
                Agregar más archivos
              </p>
            </>
          ) : (
            <>
              <Upload className="w-10 h-10 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-300 mb-2">
                Arrastra archivos aquí o haz clic para seleccionar
              </p>
              <p className="text-sm text-gray-500">
                Formatos: {VALID_EXTENSIONS.join(', ')} (max 1MB cada uno, 5MB total)
              </p>
            </>
          )}
        </label>
      </div>

      {/* Hint text */}
      {onHelpClick && (
        <p className="text-sm text-gray-500">
          Sube configuraciones de agente, prompts o especificaciones.{' '}
          <button
            onClick={onHelpClick}
            type="button"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Ver ejemplos
          </button>
        </p>
      )}

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}
