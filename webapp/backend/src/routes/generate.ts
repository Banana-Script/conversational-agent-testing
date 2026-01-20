import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import type { GenerateRequest, Job, Provider, JobMode } from '../types/index.js';
import { SSEConnection, addConnection, broadcastToJob, removeJobConnections } from '../middleware/sse.js';
import { claudeExecutor } from '../services/claude-executor.js';
import { createTestsZip } from '../services/zip-creator.js';
import { ragExecutor } from '../services/rag-executor.js';
import { createRagZip } from '../services/rag-zip-creator.js';
import { getSupportedRagExtensions, isSupportedForRag } from '../services/file-converter.js';

const router = Router();

// In-memory job storage (for simplicity - in production use Redis)
const jobs = new Map<string, Job>();

// Job cleanup configuration
const JOB_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

// Cleanup old jobs to prevent memory leaks
function cleanupOldJobs(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [jobId, job] of jobs.entries()) {
    const age = now - job.createdAt.getTime();
    const isFinished = job.status === 'completed' || job.status === 'failed';

    if (isFinished && age > JOB_MAX_AGE_MS) {
      // Clean up ZIP files if they exist
      if (job.zipPath) {
        unlink(job.zipPath).catch(() => {});
      }
      if (job.ragZipPath) {
        unlink(job.ragZipPath).catch(() => {});
      }
      // Clean up any remaining SSE connections
      removeJobConnections(jobId);
      jobs.delete(jobId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[JobCleanup] Removed ${cleaned} old jobs, ${jobs.size} remaining`);
  }
}

// Start cleanup interval
setInterval(cleanupOldJobs, CLEANUP_INTERVAL_MS);

// Validate provider
function isValidProvider(provider: string): provider is Provider {
  return ['elevenlabs', 'vapi', 'viernes'].includes(provider);
}

// Validate job mode
function isValidJobMode(mode: string): mode is JobMode {
  return ['tests-only', 'rag-only', 'rag-then-tests'].includes(mode);
}

// POST /api/generate - Start test generation
router.post('/', async (req: Request, res: Response) => {
  try {
    const { content, files, provider, contentType, organizationId, agentId, options, mode } = req.body as GenerateRequest;

    // Determine job mode (default to tests-only for backward compatibility)
    const jobMode: JobMode = mode && isValidJobMode(mode) ? mode : 'tests-only';

    // Validation: require either content (deprecated) or files (new)
    const hasContent = content && typeof content === 'string';
    const hasFiles = files && Array.isArray(files) && files.length > 0;

    if (!hasContent && !hasFiles) {
      return res.status(400).json({ error: 'content or files array is required' });
    }

    if (!provider || !isValidProvider(provider)) {
      return res.status(400).json({ error: 'valid provider is required (elevenlabs, vapi, viernes)' });
    }

    // Validate content size
    if (hasContent && content.length > 1024 * 1024) {
      return res.status(400).json({ error: 'content exceeds 1MB limit' });
    }

    // Validate files
    if (hasFiles) {
      // Different limits based on mode - RAG mode allows larger files and more formats
      const isRagMode = jobMode === 'rag-only' || jobMode === 'rag-then-tests';
      const MAX_FILE_SIZE = isRagMode ? 20 * 1024 * 1024 : 1024 * 1024; // 20MB for RAG, 1MB for tests
      const MAX_TOTAL_SIZE = isRagMode ? 50 * 1024 * 1024 : 5 * 1024 * 1024; // 50MB for RAG, 5MB for tests
      const ALLOWED_EXTENSIONS = isRagMode
        ? getSupportedRagExtensions()  // Extended formats for RAG
        : ['.txt', '.md', '.json', '.yaml', '.yml'];  // Original formats for tests

      let totalSize = 0;
      for (const file of files) {
        if (!file.name || !file.content) {
          return res.status(400).json({ error: 'Each file must have name and content' });
        }

        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return res.status(400).json({ error: `File extension not allowed: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` });
        }

        if (file.content.length > MAX_FILE_SIZE) {
          const limitMB = MAX_FILE_SIZE / (1024 * 1024);
          return res.status(400).json({ error: `File ${file.name} exceeds ${limitMB}MB limit` });
        }

        totalSize += file.content.length;
      }

      if (totalSize > MAX_TOTAL_SIZE) {
        const limitMB = MAX_TOTAL_SIZE / (1024 * 1024);
        return res.status(400).json({ error: `Total file size exceeds ${limitMB}MB limit` });
      }
    }

    // Create job
    const jobId = uuidv4();
    const job: Job = {
      id: jobId,
      status: 'queued',
      provider,
      mode: jobMode,
      content: hasContent ? content : undefined,
      contextFiles: hasFiles ? files : undefined,
      organizationId,
      agentId,
      options,
      createdAt: new Date(),
      generatedFiles: [],
    };

    jobs.set(jobId, job);

    // Start processing in background
    processJob(job).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
    });

    // Return job info
    return res.status(202).json({
      jobId,
      status: 'queued',
      sseEndpoint: `/api/generate/${jobId}/events`,
    });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/generate/:jobId/events - SSE endpoint for progress
router.get('/:jobId/events', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Create SSE connection
  const sse = new SSEConnection(res);
  addConnection(jobId, sse);

  // Send current status
  sse.sendProgress(`Estado actual: ${job.status}`);

  // If job already completed, send completion event
  if (job.status === 'completed' && job.zipPath) {
    sse.sendCompleted(`/api/generate/${jobId}/download`, job.generatedFiles.length);
  } else if (job.status === 'failed') {
    sse.sendError(job.error || 'Unknown error');
  }

  // Keep connection open
  req.on('close', () => {
    sse.close();
  });
});

// GET /api/generate/:jobId/status - Get job status (non-SSE)
router.get('/:jobId/status', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const hasTests = job.generatedFiles.length > 0;
  const hasRag = job.ragFiles && job.ragFiles.length > 0;
  const isComplete = job.status === 'completed';

  return res.json({
    jobId: job.id,
    status: job.status,
    mode: job.mode,
    filesCount: job.generatedFiles.length,
    ragFilesCount: job.ragFiles?.length || 0,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    downloadUrl: isComplete && hasTests ? `/api/generate/${jobId}/download` : undefined,
    ragDownloadUrl: isComplete && hasRag ? `/api/generate/${jobId}/download-rag` : undefined,
  });
});

// GET /api/generate/:jobId/download - Download ZIP
router.get('/:jobId/download', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job not completed yet' });
  }

  if (!job.zipPath || !existsSync(job.zipPath)) {
    return res.status(404).json({ error: 'ZIP file not found' });
  }

  const filename = `tests-${job.provider}-${job.id.substring(0, 8)}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stream = createReadStream(job.zipPath);
  stream.pipe(res);

  stream.on('end', async () => {
    // Cleanup ZIP after download
    try {
      await unlink(job.zipPath!);
    } catch {
      // Ignore cleanup errors
    }
  });
});

// GET /api/generate/:jobId/download-rag - Download RAG Knowledge Base ZIP
router.get('/:jobId/download-rag', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (!job.ragZipPath || !existsSync(job.ragZipPath)) {
    return res.status(404).json({ error: 'RAG ZIP file not found' });
  }

  const filename = `knowledge-base-${job.id.substring(0, 8)}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stream = createReadStream(job.ragZipPath);
  stream.pipe(res);

  // Note: Don't delete RAG ZIP immediately as user may download multiple times
  // It will be cleaned up by the job cleanup routine
});

// Background job processor
async function processJob(job: Job): Promise<void> {
  try {
    const mode = job.mode;

    broadcastToJob(job.id, {
      type: 'progress',
      message: `Iniciando procesamiento (modo: ${mode})...`,
      timestamp: new Date().toISOString(),
    });

    // Phase 1: RAG Preprocessing (if applicable)
    if (mode === 'rag-only' || mode === 'rag-then-tests') {
      job.status = 'preprocessing';

      broadcastToJob(job.id, {
        type: 'progress',
        message: 'Fase 1: Preprocesamiento RAG...',
        timestamp: new Date().toISOString(),
      });

      await ragExecutor.execute(job);

      // Create RAG ZIP if files were generated
      if (job.ragFiles && job.ragFiles.length > 0) {
        broadcastToJob(job.id, {
          type: 'progress',
          message: 'Creando archivo ZIP de base de conocimiento...',
          timestamp: new Date().toISOString(),
        });

        job.ragZipPath = await createRagZip(job.ragFiles, job.id);

        broadcastToJob(job.id, {
          type: 'rag_completed',
          message: `RAG completado: ${job.ragFiles.length} archivos de conocimiento`,
          timestamp: new Date().toISOString(),
          data: {
            ragDownloadUrl: `/api/generate/${job.id}/download-rag`,
            ragTotalFiles: job.ragFiles.length,
          },
        });
      }
    }

    // Phase 2: Test Generation (if applicable)
    if (mode === 'tests-only' || mode === 'rag-then-tests') {
      job.status = 'processing';

      broadcastToJob(job.id, {
        type: 'progress',
        message: mode === 'rag-then-tests'
          ? 'Fase 2: Generacion de tests desde base de conocimiento...'
          : 'Generando tests...',
        timestamp: new Date().toISOString(),
      });

      // If RAG was done first, use RAG output as context for test generation
      if (mode === 'rag-then-tests' && job.ragFiles && job.ragFiles.length > 0) {
        // Convert RAG files to context files for test generation
        job.contextFiles = job.ragFiles.map(f => ({
          name: f.path,
          content: f.content,
        }));
      }

      // Execute test generation
      await claudeExecutor.execute(job);

      if (job.generatedFiles.length === 0) {
        throw new Error('No se generaron tests');
      }

      // Create Tests ZIP
      broadcastToJob(job.id, {
        type: 'progress',
        message: 'Creando archivo ZIP de tests...',
        timestamp: new Date().toISOString(),
      });

      job.zipPath = await createTestsZip(job.generatedFiles, job.provider);
    }

    // Determine what completion message to send
    const hasRag = job.ragFiles && job.ragFiles.length > 0;
    const hasTests = job.generatedFiles.length > 0;

    let completionMessage = '';
    const completionData: Record<string, unknown> = {};

    if (mode === 'rag-only' && hasRag) {
      completionMessage = `RAG completado: ${job.ragFiles!.length} archivos de conocimiento`;
      completionData.ragDownloadUrl = `/api/generate/${job.id}/download-rag`;
      completionData.ragTotalFiles = job.ragFiles!.length;
    } else if (mode === 'tests-only' && hasTests) {
      completionMessage = `Generacion completada: ${job.generatedFiles.length} tests`;
      completionData.downloadUrl = `/api/generate/${job.id}/download`;
      completionData.totalFiles = job.generatedFiles.length;
    } else if (mode === 'rag-then-tests') {
      const ragCount = hasRag ? job.ragFiles!.length : 0;
      const testCount = hasTests ? job.generatedFiles.length : 0;
      completionMessage = `Completado: ${ragCount} archivos KB + ${testCount} tests`;
      completionData.downloadUrl = `/api/generate/${job.id}/download`;
      completionData.ragDownloadUrl = `/api/generate/${job.id}/download-rag`;
      completionData.totalFiles = testCount;
      completionData.ragTotalFiles = ragCount;
    }

    // Send completion event
    broadcastToJob(job.id, {
      type: 'completed',
      message: completionMessage,
      timestamp: new Date().toISOString(),
      data: completionData,
    });

    job.status = 'completed';
    job.completedAt = new Date();
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';

    broadcastToJob(job.id, {
      type: 'error',
      message: job.error,
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
