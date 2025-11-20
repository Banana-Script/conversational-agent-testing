/**
 * Sistema de caché para conversaciones generadas
 * Evita consumir tokens innecesariamente regenerando conversaciones idénticas
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import type { ConversationTurn } from '../types/index.js';

export interface CachedConversation {
  hash: string;
  testName: string;
  generatedAt: string;
  model: string;
  turns: ConversationTurn[];
}

export class ConversationCache {
  private cacheDir: string;

  constructor(cacheDir: string = '.tmp/conversations') {
    this.cacheDir = cacheDir;
  }

  /**
   * Genera un hash único para la configuración del test
   * Basado en: prompt, first_message, variables, model, temperature
   */
  private generateHash(config: {
    prompt: string;
    firstMessage: string;
    variables: Record<string, any>;
    model: string;
    temperature: number;
  }): string {
    const content = JSON.stringify({
      prompt: config.prompt,
      firstMessage: config.firstMessage,
      variables: config.variables,
      model: config.model,
      temperature: config.temperature,
    });

    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Obtiene una conversación cacheada si existe
   */
  async get(config: {
    testName: string;
    prompt: string;
    firstMessage: string;
    variables: Record<string, any>;
    model: string;
    temperature: number;
  }): Promise<ConversationTurn[] | null> {
    try {
      const hash = this.generateHash(config);
      const cachePath = join(this.cacheDir, `${hash}.json`);

      const content = await readFile(cachePath, 'utf-8');
      const cached: CachedConversation = JSON.parse(content);

      // Validar que el hash coincide
      if (cached.hash !== hash) {
        console.warn(`[Cache] Hash mismatch for ${config.testName}, regenerating...`);
        return null;
      }

      console.log(`[Cache] HIT for "${config.testName}" (generated: ${cached.generatedAt})`);
      return cached.turns;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`[Cache] MISS for "${config.testName}"`);
        return null;
      }
      console.warn(`[Cache] Error reading cache for ${config.testName}:`, error.message);
      return null;
    }
  }

  /**
   * Guarda una conversación en caché
   */
  async set(
    config: {
      testName: string;
      prompt: string;
      firstMessage: string;
      variables: Record<string, any>;
      model: string;
      temperature: number;
    },
    turns: ConversationTurn[]
  ): Promise<void> {
    try {
      // Asegurar que el directorio existe
      await mkdir(this.cacheDir, { recursive: true });

      const hash = this.generateHash(config);
      const cachePath = join(this.cacheDir, `${hash}.json`);

      const cached: CachedConversation = {
        hash,
        testName: config.testName,
        generatedAt: new Date().toISOString(),
        model: config.model,
        turns,
      };

      await writeFile(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
      console.log(`[Cache] SAVED for "${config.testName}"`);
    } catch (error: any) {
      console.warn(`[Cache] Error saving cache for ${config.testName}:`, error.message);
    }
  }

  /**
   * Limpia el caché (opcional, para debugging)
   */
  async clear(): Promise<void> {
    try {
      const { readdir, unlink } = await import('fs/promises');
      const files = await readdir(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          await unlink(join(this.cacheDir, file));
        }
      }

      console.log('[Cache] Cleared all cached conversations');
    } catch (error: any) {
      console.warn('[Cache] Error clearing cache:', error.message);
    }
  }
}
