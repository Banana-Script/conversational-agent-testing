/**
 * Factory para crear instancias de providers
 * Maneja la creación y configuración de providers basado en tipo
 */

import { ElevenLabsProvider } from '../providers/elevenlabs-provider.js';
import { VapiProvider } from '../providers/vapi-provider.js';
import { ChatBasedVapiProvider } from '../providers/chat-based-vapi-provider.js';
import type { TestProvider } from '../providers/base-provider.js';
import type { ElevenLabsConfig } from '../types/index.js';
import type { VapiConfig } from '../types/vapi.types.js';

/**
 * Tipo de provider soportado
 */
export type ProviderType = 'elevenlabs' | 'vapi';

/**
 * Configuración para crear un provider
 */
export interface ProviderConfig {
  elevenlabs?: ElevenLabsConfig;
  vapi?: VapiConfig;
}

/**
 * Factory para crear providers
 */
export class ProviderFactory {
  /**
   * Crea una instancia del provider especificado
   * @param type Tipo de provider a crear
   * @param config Configuración del provider
   * @returns Instancia del provider
   */
  static create(type: ProviderType, config: ProviderConfig): TestProvider {
    switch (type) {
      case 'elevenlabs':
        return this.createElevenLabsProvider(config.elevenlabs);

      case 'vapi':
        return this.createVapiProvider(config.vapi);

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Crea provider de ElevenLabs
   */
  private static createElevenLabsProvider(config?: ElevenLabsConfig): ElevenLabsProvider {
    if (!config) {
      // Intentar cargar desde variables de entorno
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY not found in environment');
      }

      config = {
        apiKey,
        baseURL: process.env.ELEVENLABS_BASE_URL,
      };
    }

    return new ElevenLabsProvider(config);
  }

  /**
   * Crea provider de Vapi
   * Si VAPI_USE_CHAT_API=true, usa ChatBasedVapiProvider (Chat API + Claude Code)
   * Si VAPI_USE_CHAT_API=false o no está definido, usa VapiProvider (Evals API)
   */
  private static createVapiProvider(config?: VapiConfig): VapiProvider | ChatBasedVapiProvider {
    if (!config) {
      // Intentar cargar desde variables de entorno
      const apiKey = process.env.VAPI_API_KEY;
      if (!apiKey) {
        throw new Error('VAPI_API_KEY not found in environment');
      }

      config = {
        apiKey,
        assistantId: process.env.VAPI_ASSISTANT_ID,
      };
    }

    // Determinar si usar Chat API con Claude Code
    const useChatApi = process.env.VAPI_USE_CHAT_API === 'true';

    if (useChatApi) {
      console.log('[ProviderFactory] Using ChatBasedVapiProvider (Chat API + OpenAI)');
      return new ChatBasedVapiProvider({
        apiKey: config.apiKey,
        assistantId: config.assistantId,
        verbose: process.env.VAPI_VERBOSE === 'true',
        generatorModel: process.env.VAPI_EVAL_GENERATOR_MODEL,
        judgeModel: process.env.VAPI_EVAL_JUDGE_MODEL,
        temperature: process.env.VAPI_EVAL_TEMPERATURE
          ? parseFloat(process.env.VAPI_EVAL_TEMPERATURE)
          : undefined,
        maxTokens: process.env.VAPI_MAX_CONVERSATION_TOKENS
          ? parseInt(process.env.VAPI_MAX_CONVERSATION_TOKENS, 10)
          : undefined,
      });
    }

    console.log('[ProviderFactory] Using VapiProvider (Evals API)');
    return new VapiProvider(config);
  }

  /**
   * Determina el provider a usar basado en:
   * 1. Campo provider del test
   * 2. Variable de entorno TEST_PROVIDER
   * 3. Default: elevenlabs
   */
  static determineProvider(testProvider?: ProviderType): ProviderType {
    if (testProvider) {
      return testProvider;
    }

    const envProvider = process.env.TEST_PROVIDER as ProviderType | undefined;
    if (envProvider && this.isValidProvider(envProvider)) {
      return envProvider;
    }

    return 'elevenlabs';  // Default
  }

  /**
   * Verifica si un string es un provider válido
   */
  private static isValidProvider(provider: string): provider is ProviderType {
    return provider === 'elevenlabs' || provider === 'vapi';
  }

  /**
   * Crea providers para todos los tipos soportados
   * Útil para comparaciones o ejecución multi-provider
   */
  static createAll(config: ProviderConfig): Map<ProviderType, TestProvider> {
    const providers = new Map<ProviderType, TestProvider>();

    try {
      providers.set('elevenlabs', this.createElevenLabsProvider(config.elevenlabs));
    } catch (error) {
      // ElevenLabs no configurado, ignorar
    }

    try {
      providers.set('vapi', this.createVapiProvider(config.vapi));
    } catch (error) {
      // Vapi no configurado, ignorar
    }

    if (providers.size === 0) {
      throw new Error('No providers could be configured. Check your environment variables.');
    }

    return providers;
  }

  /**
   * Lista providers disponibles (configurados correctamente)
   */
  static listAvailableProviders(config?: ProviderConfig): ProviderType[] {
    const available: ProviderType[] = [];

    // Check ElevenLabs
    try {
      const provider = config?.elevenlabs
        ? new ElevenLabsProvider(config.elevenlabs)
        : this.createElevenLabsProvider();

      if (provider.isConfigured()) {
        available.push('elevenlabs');
      }
    } catch (error) {
      // Not available
    }

    // Check Vapi
    try {
      const provider = config?.vapi
        ? new VapiProvider(config.vapi)
        : this.createVapiProvider();

      if (provider.isConfigured()) {
        available.push('vapi');
      }
    } catch (error) {
      // Not available
    }

    return available;
  }
}
