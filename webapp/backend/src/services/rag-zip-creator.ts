/**
 * RAG ZIP Creator Service
 * Creates ZIP archives for RAG knowledge base output, preserving directory structure
 */

import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname, normalize } from 'path';
import { tmpdir } from 'os';
import type { RagFile } from '../types/index.js';

/**
 * Sanitizes a file path to prevent path traversal attacks
 * Removes any '..' sequences, leading slashes, and normalizes the path
 */
function sanitizePath(filePath: string): string {
  // Remove path traversal attempts
  let safe = filePath.replace(/\.\.\//g, '').replace(/\.\./g, '');

  // Remove leading slashes (absolute paths)
  safe = safe.replace(/^\/+/, '');

  // Remove Windows-unsafe characters
  safe = safe.replace(/[<>:"|?*]/g, '_');

  // Normalize the path
  safe = normalize(safe);

  // Remove any remaining leading slashes after normalization
  safe = safe.replace(/^\/+/, '');

  // Ensure we have something valid
  if (!safe || safe === '.' || safe === '/') {
    safe = 'file.md';
  }

  return safe;
}

/**
 * Creates a ZIP file from RAG output, preserving directory structure
 */
export async function createRagZip(
  files: RagFile[],
  jobId: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const zipDir = join(tmpdir(), 'rag-zips');

  await mkdir(zipDir, { recursive: true });

  const zipPath = join(zipDir, `knowledge-base-${timestamp}.zip`);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);

    // Add each file preserving directory structure (with sanitized paths)
    for (const file of files) {
      const safePath = sanitizePath(file.path);
      archive.append(file.content, { name: safePath });
    }

    // Generate and add README
    archive.append(generateRagReadme(files), { name: 'README.md' });

    // Generate and add manifest
    archive.append(generateManifest(files, jobId), { name: 'manifest.json' });

    archive.finalize();
  });
}

/**
 * Generates README for the RAG knowledge base ZIP
 */
function generateRagReadme(files: RagFile[]): string {
  // Group files by top-level directory
  const byDirectory = new Map<string, RagFile[]>();

  for (const file of files) {
    const topDir = file.path.split('/')[0] || 'root';
    if (!byDirectory.has(topDir)) {
      byDirectory.set(topDir, []);
    }
    byDirectory.get(topDir)!.push(file);
  }

  // Build directory listing
  const dirListing = Array.from(byDirectory.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, dirFiles]) => {
      const fileList = dirFiles
        .map(f => `    - ${f.path.split('/').slice(1).join('/') || f.path}`)
        .join('\n');
      return `- **${dir}/** (${dirFiles.length} archivos)\n${fileList}`;
    })
    .join('\n\n');

  return `# Base de Conocimiento RAG

## Informacion

- **Total Archivos:** ${files.length}
- **Generado:** ${new Date().toLocaleString()}
- **Formato:** Markdown con YAML frontmatter

## Estructura de Directorios

${dirListing}

## Formato de Archivos

Cada archivo Markdown incluye un frontmatter YAML con metadatos:

\`\`\`yaml
---
category: nombre_categoria
tags: [tag1, tag2, tag3]
last_updated: YYYY-MM-DD
source: archivo_original.pdf
confidence: high | medium | low
---
\`\`\`

## Uso con Sistemas RAG

### LangChain

\`\`\`python
from langchain.document_loaders import DirectoryLoader
from langchain.text_splitter import MarkdownHeaderTextSplitter

loader = DirectoryLoader('./', glob="**/*.md")
docs = loader.load()

# Split by headers for optimal chunking
splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ]
)

chunks = []
for doc in docs:
    chunks.extend(splitter.split_text(doc.page_content))
\`\`\`

### LlamaIndex

\`\`\`python
from llama_index import SimpleDirectoryReader
from llama_index.node_parser import MarkdownNodeParser

documents = SimpleDirectoryReader(
    input_dir="./",
    recursive=True,
    required_exts=[".md"]
).load_data()

parser = MarkdownNodeParser()
nodes = parser.get_nodes_from_documents(documents)
\`\`\`

### Semantic Search (OpenAI Embeddings)

\`\`\`python
import os
from openai import OpenAI

client = OpenAI()

# Load and embed each file
for root, dirs, files in os.walk('./'):
    for file in files:
        if file.endswith('.md'):
            with open(os.path.join(root, file)) as f:
                content = f.read()

            # Create embedding
            response = client.embeddings.create(
                input=content,
                model="text-embedding-3-small"
            )

            # Store in your vector database
            # ...
\`\`\`

## Niveles de Confianza

- **high**: Datos copiados textualmente, numeros verificados
- **medium**: Datos interpretados, numeros revisados
- **low**: Datos inferidos o parcialmente ambiguos en la fuente

## Notas

- Los precios y datos numericos han sido extraidos con precision
- Cada archivo cubre UN tema para chunking optimo
- La estructura de directorios refleja la organizacion del conocimiento

---

Generado con Test Generator Web App - RAG Preprocessing
`;
}

/**
 * Generates manifest.json with metadata about all files
 */
function generateManifest(files: RagFile[], jobId: string): string {
  // Extract metadata from frontmatter
  const fileMetadata = files.map(file => {
    const frontmatterMatch = file.content.match(/^---\n([\s\S]*?)\n---/);
    let metadata: Record<string, unknown> = {};

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          let value: unknown = valueParts.join(':').trim();

          // Parse arrays
          if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            try {
              value = JSON.parse(value.replace(/'/g, '"'));
            } catch {
              // Keep as string if parsing fails
            }
          }

          metadata[key.trim()] = value;
        }
      }
    }

    return {
      path: file.path,
      size: file.content.length,
      ...metadata,
    };
  });

  const manifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    jobId,
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.content.length, 0),
    files: fileMetadata,
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * Counts files by category
 */
export function countFilesByCategory(files: RagFile[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const file of files) {
    const topDir = file.path.split('/')[0] || 'uncategorized';
    counts.set(topDir, (counts.get(topDir) || 0) + 1);
  }

  return counts;
}
