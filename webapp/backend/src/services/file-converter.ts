/**
 * File Converter Service
 * Converts various file formats to markdown for Claude processing
 *
 * Supported formats:
 * - Excel (.xlsx, .xls) -> Markdown tables
 * - Word (.docx) -> Markdown
 * - PDF/Images -> Passed directly to Claude (native multimodal support)
 */

import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

// Type for mammoth conversion result
interface MammothResult {
  value: string;
  messages: Array<{ message: string }>;
}

export interface ConversionResult {
  content: string;
  originalFormat: string;
  wasConverted: boolean;
}

/**
 * Converts Excel file buffer to markdown tables
 */
export async function convertExcel(buffer: Buffer, filename: string): Promise<ConversionResult> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const markdownParts: string[] = [];

    markdownParts.push(`# ${filename}\n`);
    markdownParts.push(`*Converted from Excel file*\n`);

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      // Get the range of the worksheet
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

      if (range.e.r < 0 || range.e.c < 0) {
        continue; // Empty sheet
      }

      markdownParts.push(`\n## ${sheetName}\n`);

      // Convert to JSON for easier processing (header: 1 returns array of arrays)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: ''
      }) as unknown[][];

      if (jsonData.length === 0) {
        markdownParts.push('*Empty sheet*\n');
        continue;
      }

      // Build markdown table
      const headers = jsonData[0] as string[];
      if (headers.length === 0) continue;

      // Header row
      markdownParts.push('| ' + headers.map(h => String(h || '').replace(/\|/g, '\\|')).join(' | ') + ' |');
      // Separator row
      markdownParts.push('|' + headers.map(() => '---').join('|') + '|');

      // Data rows
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[];
        const cells = headers.map((_, idx) => {
          const cell = row[idx];
          return String(cell ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        });
        markdownParts.push('| ' + cells.join(' | ') + ' |');
      }

      markdownParts.push('');
    }

    return {
      content: markdownParts.join('\n'),
      originalFormat: 'excel',
      wasConverted: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to convert Excel file: ${errorMsg}`);
  }
}

/**
 * Converts Word document buffer to markdown
 */
export async function convertWord(buffer: Buffer, filename: string): Promise<ConversionResult> {
  try {
    // Use type assertion for mammoth.convertToMarkdown which exists but may not be in types
    const mammothAny = mammoth as unknown as { convertToMarkdown: (options: { buffer: Buffer }) => Promise<MammothResult> };
    const result = await mammothAny.convertToMarkdown({ buffer });

    let content = `# ${filename}\n\n`;
    content += `*Converted from Word document*\n\n`;
    content += result.value;

    // Log any conversion warnings
    if (result.messages.length > 0) {
      console.warn(`[FileConverter] Word conversion warnings for ${filename}:`,
        result.messages.map((m: { message: string }) => m.message).join(', '));
    }

    return {
      content,
      originalFormat: 'word',
      wasConverted: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to convert Word document: ${errorMsg}`);
  }
}

/**
 * Determines if a file needs conversion or can be passed directly to Claude
 */
export function needsConversion(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  // These formats need server-side conversion
  const conversionRequired = ['.xlsx', '.xls', '.docx'];

  return conversionRequired.includes(ext);
}

/**
 * Determines if a file is natively supported by Claude CLI (multimodal)
 */
export function isNativeClaudeFormat(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  // Claude CLI can read these natively
  const nativeFormats = [
    '.txt', '.md', '.json', '.yaml', '.yml',  // Text formats
    '.pdf',                                     // PDF (native)
    '.png', '.jpg', '.jpeg', '.gif', '.webp',  // Images (native OCR)
  ];

  return nativeFormats.includes(ext);
}

/**
 * Gets the MIME type for a file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Converts a file buffer based on its extension
 * Returns null if the file should be passed directly to Claude
 */
export async function convertFile(
  buffer: Buffer,
  filename: string
): Promise<ConversionResult | null> {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  switch (ext) {
    case '.xlsx':
    case '.xls':
      return convertExcel(buffer, filename);

    case '.docx':
      return convertWord(buffer, filename);

    default:
      // File doesn't need conversion (text, PDF, images)
      return null;
  }
}

/**
 * Validates if a file extension is supported for RAG processing
 */
export function isSupportedForRag(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  const supportedExtensions = [
    // Text formats
    '.txt', '.md', '.json', '.yaml', '.yml',
    // Documents
    '.pdf', '.docx',
    // Spreadsheets
    '.xlsx', '.xls',
    // Images (for OCR)
    '.png', '.jpg', '.jpeg',
  ];

  return supportedExtensions.includes(ext);
}

/**
 * Returns list of all supported extensions for RAG mode
 */
export function getSupportedRagExtensions(): string[] {
  return ['.txt', '.md', '.json', '.yaml', '.yml', '.pdf', '.docx', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];
}
