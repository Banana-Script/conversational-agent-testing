import { Upload, Sparkles, Cpu, FileText, Download } from 'lucide-react';

interface StepProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  isLast: boolean;
}

function Step({ icon, title, description, isLast }: StepProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="p-3 bg-gray-700 rounded-lg flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-white mb-1">{title}</h4>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
      {!isLast && (
        <div className="w-px h-8 bg-gray-700 mt-12 -mb-4 ml-2" />
      )}
    </div>
  );
}

export function HowItWorksTab() {
  const steps = [
    {
      icon: <Upload className="w-6 h-6 text-blue-400" />,
      title: 'Upload',
      description: 'Subes archivos de contexto sobre tu agente'
    },
    {
      icon: <Sparkles className="w-6 h-6 text-purple-400" />,
      title: 'Processing',
      description: 'Claude Code CLI procesa tus archivos con IA'
    },
    {
      icon: <Cpu className="w-6 h-6 text-green-400" />,
      title: 'Analysis',
      description: 'Claude analiza el comportamiento y genera estrategias de testing'
    },
    {
      icon: <FileText className="w-6 h-6 text-yellow-400" />,
      title: 'Generation',
      description: 'Se generan 15-25 tests YAML automáticamente'
    },
    {
      icon: <Download className="w-6 h-6 text-blue-400" />,
      title: 'Download',
      description: 'Descargas un ZIP con todos los tests listos para ejecutar'
    }
  ];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold text-white mb-4">
          Flujo de Procesamiento
        </h3>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <Step
              key={index}
              icon={step.icon}
              title={step.title}
              description={step.description}
              isLast={index === steps.length - 1}
            />
          ))}
        </div>
      </section>

      <section className="bg-gray-700/50 rounded-lg p-4">
        <h4 className="font-semibold text-white mb-3">
          Tecnología
        </h4>
        <ul className="text-sm text-gray-400 space-y-2">
          <li>• <strong className="text-white">Claude Code CLI</strong>: Herramienta de IA para análisis de código y generación de tests</li>
          <li>• <strong className="text-white">Providers soportados</strong>: ElevenLabs, Vapi, Viernes</li>
          <li>• <strong className="text-white">Formato de salida</strong>: Tests YAML listos para ejecutar</li>
        </ul>
      </section>

      <section className="bg-gray-700/50 rounded-lg p-4">
        <h4 className="font-semibold text-white mb-3">
          Metodología de Testing
        </h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>✓ Casos felices (happy path)</li>
          <li>✓ Manejo de errores y validaciones</li>
          <li>✓ Casos edge y límite</li>
          <li>✓ Diferentes niveles de prioridad (P0-P3)</li>
        </ul>
      </section>
    </div>
  );
}
