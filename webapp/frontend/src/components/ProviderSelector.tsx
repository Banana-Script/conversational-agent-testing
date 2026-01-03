import type { Provider } from '../types';

interface ProviderSelectorProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled?: boolean;
}

const PROVIDERS: { id: Provider; name: string; description: string }[] = [
  {
    id: 'viernes',
    name: 'Viernes',
    description: 'WhatsApp, Telegram, Web chat',
  },
  {
    id: 'vapi',
    name: 'Vapi',
    description: 'Voice AI agents',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Conversational AI',
  },
];

export function ProviderSelector({ value, onChange, disabled }: ProviderSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-300">
        Provider
      </label>

      <div className="grid grid-cols-3 gap-3">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(provider.id)}
            className={`
              p-4 rounded-lg border-2 text-left transition-all
              ${value === provider.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="font-medium text-white mb-1">{provider.name}</div>
            <div className="text-xs text-gray-400">{provider.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
