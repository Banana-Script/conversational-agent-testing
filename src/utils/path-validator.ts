import { resolve, normalize, relative } from 'path';
import { stat } from 'fs/promises';

/**
 * Error personalizado para errores de validación de ruta
 */
export class PathValidationError extends Error {
  constructor(message: string, public readonly attemptedPath: string) {
    super(message);
    this.name = 'PathValidationError';
    Object.setPrototypeOf(this, PathValidationError.prototype);
  }
}

/**
 * Valida que una ruta no intente acceder fuera del directorio base (previene path traversal)
 * @param filePath - Ruta del archivo a validar
 * @param baseDir - Directorio base permitido
 * @throws PathValidationError si la ruta es inválida o intenta acceder fuera del directorio base
 */
export function validatePath(filePath: string, baseDir: string): void {
  // Normalizar rutas para prevenir ataques con ../ y ./
  const normalizedPath = normalize(filePath);
  const absoluteBase = resolve(baseDir);
  const absolutePath = resolve(normalizedPath);

  // Verificar que la ruta absoluta esté dentro del directorio base
  const relativePath = relative(absoluteBase, absolutePath);

  // Si la ruta relativa comienza con .. significa que está fuera del directorio base
  // También verificar que no sea una ruta absoluta a un directorio diferente
  if (relativePath.startsWith('..') || relativePath.startsWith('/') || /^[A-Za-z]:/.test(relativePath)) {
    throw new PathValidationError(
      `Acceso denegado: la ruta "${filePath}" intenta acceder fuera del directorio permitido "${baseDir}"`,
      filePath
    );
  }

  // Verificar caracteres peligrosos adicionales
  if (filePath.includes('\0')) {
    throw new PathValidationError(
      `Ruta inválida: contiene caracteres null bytes`,
      filePath
    );
  }
}

/**
 * Valida que un archivo exista y sea un archivo regular (no directorio, no symlink)
 * @param filePath - Ruta del archivo a validar
 * @throws PathValidationError si el archivo no existe o no es un archivo regular
 */
export async function validateFileExists(filePath: string): Promise<void> {
  try {
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      throw new PathValidationError(
        `La ruta "${filePath}" no es un archivo regular`,
        filePath
      );
    }
  } catch (error) {
    if (error instanceof PathValidationError) {
      throw error;
    }

    // Error de Node.js al acceder al archivo
    if (error && typeof error === 'object' && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT') {
        throw new PathValidationError(
          `El archivo "${filePath}" no existe`,
          filePath
        );
      }

      if (nodeError.code === 'EACCES') {
        throw new PathValidationError(
          `Acceso denegado al archivo "${filePath}"`,
          filePath
        );
      }
    }

    throw new PathValidationError(
      `Error al validar el archivo "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      filePath
    );
  }
}

/**
 * Valida completamente una ruta de archivo
 * @param filePath - Ruta del archivo a validar
 * @param baseDir - Directorio base permitido
 * @throws PathValidationError si la ruta es inválida
 */
export async function validateFilePath(filePath: string, baseDir: string): Promise<void> {
  validatePath(filePath, baseDir);
  await validateFileExists(filePath);
}
