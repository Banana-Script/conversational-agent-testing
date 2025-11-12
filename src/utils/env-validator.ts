import chalk from 'chalk';

/**
 * Error personalizado para variables de entorno faltantes
 */
export class MissingEnvVarError extends Error {
  constructor(public readonly varName: string) {
    super(`Variable de entorno requerida no encontrada: ${varName}`);
    this.name = 'MissingEnvVarError';
    Object.setPrototypeOf(this, MissingEnvVarError.prototype);
  }
}

/**
 * Obtiene una variable de entorno requerida
 * @param varName - Nombre de la variable de entorno
 * @returns Valor de la variable de entorno
 * @throws MissingEnvVarError si la variable no existe o está vacía
 */
export function getRequiredEnvVar(varName: string): string {
  const value = process.env[varName];

  if (!value || value.trim() === '') {
    throw new MissingEnvVarError(varName);
  }

  return value;
}

/**
 * Obtiene la API key de ElevenLabs desde las variables de entorno
 * @returns API key de ElevenLabs
 * @throws MissingEnvVarError si ELEVENLABS_API_KEY no está definida
 */
export function getElevenLabsApiKey(): string {
  return getRequiredEnvVar('ELEVENLABS_API_KEY');
}

/**
 * Maneja errores de variables de entorno faltantes en el CLI
 * Muestra un mensaje amigable y termina el proceso
 * @param error - Error a manejar
 */
export function handleMissingEnvVar(error: unknown): never {
  if (error instanceof MissingEnvVarError) {
    console.error(chalk.red(`❌ Error: ${error.varName} no encontrada en .env`));
    console.error(chalk.yellow('\n💡 Asegúrate de:'));
    console.error(chalk.yellow('   1. Copiar .env.example a .env'));
    console.error(chalk.yellow(`   2. Configurar ${error.varName} en el archivo .env\n`));
  } else {
    console.error(chalk.red(`\n❌ Error inesperado: ${error instanceof Error ? error.message : String(error)}\n`));
  }

  process.exit(1);
}
