import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import type { GenerateRequest, Job, Provider } from '../types/index.js';
import { SSEConnection, addConnection, broadcastToJob } from '../middleware/sse.js';
import { claudeExecutor } from '../services/claude-executor.js';
import { createTestsZip } from '../services/zip-creator.js';

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
      // Clean up ZIP file if it exists
      if (job.zipPath) {
        unlink(job.zipPath).catch(() => {});
      }
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

// POST /api/generate - Start test generation
router.post('/', async (req: Request, res: Response) => {
  try {
    const { content, files, provider, contentType, organizationId, agentId, options } = req.body as GenerateRequest;

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
      const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
      const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB total
      const ALLOWED_EXTENSIONS = ['.txt', '.md', '.json', '.yaml', '.yml'];

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
          return res.status(400).json({ error: `File ${file.name} exceeds 1MB limit` });
        }

        totalSize += file.content.length;
      }

      if (totalSize > MAX_TOTAL_SIZE) {
        return res.status(400).json({ error: 'Total file size exceeds 5MB limit' });
      }
    }

    // Create job
    const jobId = uuidv4();
    const job: Job = {
      id: jobId,
      status: 'queued',
      provider,
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

  return res.json({
    jobId: job.id,
    status: job.status,
    filesCount: job.generatedFiles.length,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    downloadUrl: job.status === 'completed' ? `/api/generate/${jobId}/download` : undefined,
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

// Background job processor
async function processJob(job: Job): Promise<void> {
  try {
    job.status = 'processing';

    broadcastToJob(job.id, {
      type: 'progress',
      message: 'Iniciando procesamiento...',
      timestamp: new Date().toISOString(),
    });

    // Execute Claude to generate tests
    await claudeExecutor.execute(job);

    if (job.generatedFiles.length === 0) {
      throw new Error('No se generaron tests');
    }

    // Create ZIP
    broadcastToJob(job.id, {
      type: 'progress',
      message: 'Creando archivo ZIP...',
      timestamp: new Date().toISOString(),
    });

    job.zipPath = await createTestsZip(job.generatedFiles, job.provider);

    // Send completion
    broadcastToJob(job.id, {
      type: 'completed',
      message: `Generacion completada: ${job.generatedFiles.length} tests`,
      timestamp: new Date().toISOString(),
      data: {
        downloadUrl: `/api/generate/${job.id}/download`,
        totalFiles: job.generatedFiles.length,
      },
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
