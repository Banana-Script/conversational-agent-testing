import { FileText, FileJson, FileCode, File } from 'lucide-react';

interface FileExampleProps {
  icon: React.ReactNode;
  filename: string;
  description: string;
}

function FileExample({ icon, filename, description }: FileExampleProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
      {icon}
      <div>
        <p className="font-mono text-sm text-white">{filename}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
  );
}

export function FilesGuideTab() {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold text-white mb-3">
          Archivos Recomendados
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Sube archivos que describan el comportamiento de tu agente conversacional:
        </p>
        <div className="space-y-3">
          <FileExample
            icon={<FileJson className="w-5 h-5 text-blue-400" />}
            filename="agent-config.json"
            description="Configuración del agente de ElevenLabs/Vapi/Viernes"
          />
          <FileExample
            icon={<FileText className="w-5 h-5 text-green-400" />}
            filename="agent-prompt.md"
            description="Instrucciones y personalidad del agente"
          />
          <FileExample
            icon={<FileCode className="w-5 h-5 text-purple-400" />}
            filename="business-spec.md"
            description="Especificaciones de negocio y casos de uso"
          />
          <FileExample
            icon={<File className="w-5 h-5 text-yellow-400" />}
            filename="api-docs.txt"
            description="Documentación de APIs y herramientas del agente"
          />
        </div>
      </section>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <p className="text-blue-300 text-sm">
          <strong>Tip:</strong> Mientras más contexto proporciones sobre tu agente,
          mejores y más específicos serán los tests generados
        </p>
      </div>

      <section>
        <h3 className="text-lg font-semibold text-white mb-3">
          Formatos Soportados
        </h3>
        <div className="flex flex-wrap gap-2">
          {['.txt', '.md', '.json', '.yaml', '.yml'].map(ext => (
            <span
              key={ext}
              className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
            >
              {ext}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-3">
          Límites
        </h3>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• Máximo 1MB por archivo</li>
          <li>• Máximo 5MB en total</li>
        </ul>
      </section>
    </div>
  );
}
