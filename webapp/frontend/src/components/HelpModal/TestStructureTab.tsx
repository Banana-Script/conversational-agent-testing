interface PriorityBadgeProps {
  level: string;
  label: string;
  color: 'red' | 'yellow' | 'blue' | 'gray';
  description: string;
}

function PriorityBadge({ level, label, color, description }: PriorityBadgeProps) {
  const colors = {
    red: 'bg-red-500/10 border-red-500 text-red-400',
    yellow: 'bg-yellow-500/10 border-yellow-500 text-yellow-400',
    blue: 'bg-blue-500/10 border-blue-500 text-blue-400',
    gray: 'bg-gray-500/10 border-gray-500 text-gray-400'
  };

  return (
    <div className={`border rounded-lg p-3 ${colors[color]}`}>
      <p className="font-semibold text-sm">{level} - {label}</p>
      <p className="text-xs opacity-75">{description}</p>
    </div>
  );
}

export function TestStructureTab() {
  const yamlExample = `name: "Ejemplo de Test Generado"
description: "Valida saludo profesional"

provider: "viernes"  # o elevenlabs, vapi
agent_id: "123"

simulated_user:
  prompt: "Cliente que llama por primera vez"
  first_message: "Hola, necesito ayuda"
  language: "es"

evaluation_criteria:
  - id: "greeting"
    name: "Saludo Profesional"
    prompt: "El agente debe saludar profesionalmente"`;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold text-white mb-3">
          Ejemplo de Test YAML
        </h3>
        <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto">
          <code className="text-sm text-gray-300 font-mono whitespace-pre">
            {yamlExample}
          </code>
        </pre>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-3">
          ¿Qué contiene cada test?
        </h3>
        <ul className="space-y-2 text-gray-400 text-sm">
          <li>
            • <strong className="text-white">Nombre y descripción</strong>: Identifica el test y su propósito
          </li>
          <li>
            • <strong className="text-white">Provider y agente</strong>: Especifica qué agente evaluar
          </li>
          <li>
            • <strong className="text-white">Usuario simulado</strong>: Define el comportamiento del usuario en la conversación
          </li>
          <li>
            • <strong className="text-white">Criterios de evaluación</strong>: Qué debe cumplir el agente para pasar el test
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-white mb-3">
          Prioridades de Tests
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <PriorityBadge
            level="P0"
            label="Smoke"
            color="red"
            description="Casos críticos"
          />
          <PriorityBadge
            level="P1"
            label="Core"
            color="yellow"
            description="Funcionalidad principal"
          />
          <PriorityBadge
            level="P2"
            label="Extended"
            color="blue"
            description="Casos secundarios"
          />
          <PriorityBadge
            level="P3"
            label="Edge"
            color="gray"
            description="Casos límite"
          />
        </div>
      </section>

      <section className="bg-gray-700/50 rounded-lg p-4">
        <h4 className="font-semibold text-white mb-2">
          Evaluación Automática
        </h4>
        <p className="text-sm text-gray-400">
          Cada test simula una conversación real con tu agente. Claude evalúa automáticamente
          si el agente cumple con los criterios definidos, proporcionando feedback detallado
          sobre qué funcionó y qué necesita mejoras.
        </p>
      </section>
    </div>
  );
}
