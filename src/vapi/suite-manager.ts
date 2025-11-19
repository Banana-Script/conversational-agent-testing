/**
 * Gestor inteligente de Test Suites de Vapi
 * Maneja creación, descubrimiento y caché automático de suites
 */

import fs from 'fs/promises';
import path from 'path';
import { VapiClient } from '../api/vapi-client.js';
import type { TestDefinition } from '../types/index.js';
import type {
  VapiTestSuite,
  VapiSuiteCache,
  VapiSuiteCacheEntry,
} from '../types/vapi.types.js';

const CACHE_FILE = '.vapi-suites.json';

export class VapiTestSuiteManager {
  private client: VapiClient;
  private cache: VapiSuiteCache = {};
  private cacheLoaded: boolean = false;
  private defaultSuite: string;
  private pendingSuiteCreations = new Map<string, Promise<string>>();

  constructor(client: VapiClient, defaultSuite: string = 'conversational-agent-testing') {
    this.client = client;
    this.defaultSuite = defaultSuite;
  }

  /**
   * Obtiene o crea el suite apropiado para un test
   * Basado en categoría/tags del test
   */
  async getSuiteForTest(test: TestDefinition): Promise<string> {
    const suiteName = this.determineSuiteName(test);
    return this.getOrCreateSuite(suiteName);
  }

  /**
   * Determina el nombre del suite basado en el test
   * Prioridad: category > primer tag > default
   */
  private determineSuiteName(test: TestDefinition): string {
    // Prioridad 1: Campo category explícito
    if (test.category) {
      return this.normalizeSuiteName(test.category);
    }

    // Prioridad 2: Primer tag
    if (test.tags && test.tags.length > 0) {
      return this.normalizeSuiteName(test.tags[0]);
    }

    // Prioridad 3: Default
    return this.defaultSuite;
  }

  /**
   * Normaliza nombre de suite (lowercase, sin espacios, etc.)
   */
  private normalizeSuiteName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Obtiene o crea un suite por nombre
   * 1. Busca en caché local
   * 2. Si no existe, consulta API de Vapi
   * 3. Si no existe en Vapi, crea nuevo
   * 4. Guarda en caché
   *
   * Usa mutex para prevenir race conditions en creación concurrente
   */
  async getOrCreateSuite(suiteName: string): Promise<string> {
    // Asegurar que el caché esté cargado
    await this.ensureCacheLoaded();

    // Check if already being created (prevent race condition)
    const pending = this.pendingSuiteCreations.get(suiteName);
    if (pending) {
      return pending;
    }

    // 1. Buscar en caché local
    if (this.cache[suiteName]) {
      // Actualizar last_used
      this.cache[suiteName].last_used = new Date().toISOString();
      await this.saveCache();
      return this.cache[suiteName].id;
    }

    // 2 & 3. Buscar en API o crear (con lock para prevenir duplicados)
    const creationPromise = this.createSuiteWithLock(suiteName);
    this.pendingSuiteCreations.set(suiteName, creationPromise);

    try {
      const suiteId = await creationPromise;
      return suiteId;
    } finally {
      this.pendingSuiteCreations.delete(suiteName);
    }
  }

  /**
   * Crea un suite con lock para prevenir duplicados
   * @private
   */
  private async createSuiteWithLock(suiteName: string): Promise<string> {
    // 2. Buscar en Vapi API
    const existingSuite = await this.client.findTestSuiteByName(suiteName);
    if (existingSuite) {
      // Agregar a caché
      await this.addToCache(suiteName, existingSuite);
      return existingSuite.id;
    }

    // 3. Crear nuevo suite en Vapi
    const newSuite = await this.client.createTestSuite({
      name: suiteName,
      description: `Auto-generated suite for ${suiteName}`,
    });

    // Agregar a caché
    await this.addToCache(suiteName, newSuite);

    return newSuite.id;
  }

  /**
   * Lista todos los suites (combinando caché y API)
   */
  async listSuites(): Promise<Array<VapiSuiteCacheEntry & { source: 'cache' | 'api' }>> {
    await this.ensureCacheLoaded();

    const suites: Array<VapiSuiteCacheEntry & { source: 'cache' | 'api' }> = [];

    // Agregar suites del caché
    for (const [name, entry] of Object.entries(this.cache)) {
      suites.push({ ...entry, source: 'cache' });
    }

    // Opcionalmente, sincronizar con API para descubrir nuevos suites
    // (Esto es opcional y podría ser costoso en API calls)

    return suites;
  }

  /**
   * Sincroniza el caché con la API de Vapi
   * Descubre suites nuevos creados fuera de este manager
   */
  async syncWithAPI(): Promise<void> {
    const apiSuites = await this.client.listTestSuites();

    for (const suite of apiSuites) {
      const name = this.normalizeSuiteName(suite.name);

      if (!this.cache[name]) {
        // Nuevo suite descubierto
        this.cache[name] = {
          id: suite.id,
          name: suite.name,
          created_at: suite.createdAt,
          last_used: new Date().toISOString(),
        };
      }
    }

    await this.saveCache();
  }

  /**
   * Limpia el caché local
   */
  async clearCache(): Promise<void> {
    this.cache = {};
    await this.saveCache();
    this.cacheLoaded = false;
  }

  /**
   * Elimina suites no usados recientemente del caché
   */
  async pruneCache(olderThanDays: number = 30): Promise<number> {
    await this.ensureCacheLoaded();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let prunedCount = 0;

    for (const [name, entry] of Object.entries(this.cache)) {
      const lastUsed = new Date(entry.last_used);
      if (lastUsed < cutoffDate) {
        delete this.cache[name];
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      await this.saveCache();
    }

    return prunedCount;
  }

  /**
   * Obtiene estadísticas del caché
   */
  async getStats(): Promise<{
    totalSuites: number;
    oldestUsed: string | null;
    newestUsed: string | null;
    totalTests: number;
  }> {
    await this.ensureCacheLoaded();

    const entries = Object.values(this.cache);
    if (entries.length === 0) {
      return {
        totalSuites: 0,
        oldestUsed: null,
        newestUsed: null,
        totalTests: 0,
      };
    }

    const sortedByLastUsed = entries.sort(
      (a, b) => new Date(a.last_used).getTime() - new Date(b.last_used).getTime()
    );

    const totalTests = entries.reduce((sum, e) => sum + (e.tests_count || 0), 0);

    return {
      totalSuites: entries.length,
      oldestUsed: sortedByLastUsed[0].last_used,
      newestUsed: sortedByLastUsed[sortedByLastUsed.length - 1].last_used,
      totalTests,
    };
  }

  /**
   * Agrega un suite al caché
   */
  private async addToCache(name: string, suite: VapiTestSuite): Promise<void> {
    this.cache[name] = {
      id: suite.id,
      name: suite.name,
      created_at: suite.createdAt,
      last_used: new Date().toISOString(),
    };

    await this.saveCache();
  }

  /**
   * Asegura que el caché esté cargado
   */
  private async ensureCacheLoaded(): Promise<void> {
    if (!this.cacheLoaded) {
      await this.loadCache();
      this.cacheLoaded = true;
    }
  }

  /**
   * Carga el caché desde el archivo
   */
  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(CACHE_FILE, 'utf-8');

      // Parse with error handling
      try {
        const parsed = JSON.parse(content);

        // Validate cache structure
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Invalid cache structure: expected object');
        }

        this.cache = parsed as VapiSuiteCache;
      } catch (parseError: any) {
        console.warn(`Cache file corrupted (${parseError.message}), resetting cache`);
        this.cache = {};
        // Save empty cache to fix corrupted file
        await this.saveCache();
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Archivo no existe, inicializar caché vacío
        this.cache = {};
      } else if (error.message?.includes('corrupted')) {
        // Already handled above
        this.cache = {};
      } else {
        // Otro error, re-throw
        throw new Error(`Failed to load cache: ${error.message}`);
      }
    }
  }

  /**
   * Guarda el caché al archivo
   */
  private async saveCache(): Promise<void> {
    try {
      const content = JSON.stringify(this.cache, null, 2);
      await fs.writeFile(CACHE_FILE, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save cache: ${error.message}`);
    }
  }

  /**
   * Obtiene el path del archivo de caché
   */
  static getCachePath(): string {
    return path.resolve(process.cwd(), CACHE_FILE);
  }
}
