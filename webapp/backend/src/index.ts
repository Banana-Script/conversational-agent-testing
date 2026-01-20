import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import multer from 'multer';
import { Server } from 'http';

import generateRouter from './routes/generate.js';
import viernesRouter from './routes/viernes.js';
import elevenLabsRouter from './routes/elevenlabs.js';
import { claudeExecutor } from './services/claude-executor.js';
import { database } from './services/database.js';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Module-level variables for shutdown management
let serverInstance: Server | null = null;
let isShuttingDown = false;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20gb' }));
app.use(express.urlencoded({ extended: true }));

// File upload middleware
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['text/plain', 'text/markdown', 'text/x-markdown'];
    const allowedExtensions = ['.txt', '.md'];

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedExtensions.includes(ext) || allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .txt o .md'));
    }
  },
});

// API Routes
app.use('/api/generate', generateRouter);
app.use('/api/viernes', viernesRouter);
app.use('/api/elevenlabs', elevenLabsRouter);

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const content = req.file.buffer.toString('utf-8');

  return res.json({
    filename: req.file.originalname,
    size: req.file.size,
    content,
  });
});

// Health check with database metrics
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    claudeToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'configured' : 'missing',
    database: database.getPoolStats(),
  });
});

// Serve static frontend files (production)
const publicPath = join(__dirname, '../public');
app.use(express.static(publicPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.sendFile(join(publicPath, 'index.html'));
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

// Start server
async function start(): Promise<Server> {
  console.log('[STARTUP] 🚀 Starting application...');
  console.log('[STARTUP] Node version:', process.version);
  console.log('[STARTUP] Environment:', process.env.NODE_ENV || 'development');
  console.log('[STARTUP] Platform:', process.platform);
  console.log('[STARTUP] Working directory:', process.cwd());

  // Log environment config (without sensitive data)
  console.log('[STARTUP] Configuration:', {
    port: PORT,
    mysqlHost: process.env.MYSQL_HOST || 'not set',
    mysqlPort: process.env.MYSQL_PORT || 'not set',
    mysqlUser: process.env.MYSQL_USER || 'not set',
    mysqlDatabase: process.env.MYSQL_DATABASE || 'not set',
    claudeTokenConfigured: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'yes' : 'no',
  });

  try {
    console.log('[STARTUP] Step 1/3: Initializing Claude executor...');
    const claudeStartTime = Date.now();
    await claudeExecutor.initialize();
    const claudeDuration = Date.now() - claudeStartTime;
    console.log(`[STARTUP] ✅ Claude executor initialized in ${claudeDuration}ms`);
  } catch (error) {
    console.warn('[STARTUP] ⚠️ Claude executor initialization warning:', error);
  }

  // Make database required if credentials are configured
  if (process.env.MYSQL_HOST && process.env.MYSQL_USER) {
    try {
      console.log('[STARTUP] Step 2/3: Initializing database connection...');
      console.log('[STARTUP] Database config:', {
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        database: process.env.MYSQL_DATABASE,
      });

      const dbStartTime = Date.now();
      // Initialize database connection (waits for SSH tunnel)
      await database.initialize();
      const dbDuration = Date.now() - dbStartTime;
      console.log(`[STARTUP] ✅ Database connection established in ${dbDuration}ms`);
    } catch (error) {
      console.error('[STARTUP] ❌ FATAL: Database initialization failed:', error);
      throw error;
    }
  } else {
    console.warn('[STARTUP] ⚠️ Database credentials not configured, skipping...');
  }

  console.log('[STARTUP] Step 3/3: Starting HTTP server...');
  serverInstance = app.listen(PORT, () => {
    console.log(`[STARTUP] ✅ HTTP server listening on port ${PORT}`);
    console.log(`
╔════════════════════════════════════════════════════════╗
║  Test Generator Web App                                ║
║  ────────────────────────────────────────────────────  ║
║  Server running on http://localhost:${PORT}              ║
║                                                        ║
║  Endpoints:                                            ║
║  - GET  /health                   Health check         ║
║  - POST /api/upload               Upload file          ║
║  - POST /api/generate             Start generation     ║
║  - GET  /api/generate/:id/*       Job status/events    ║
║  - GET  /api/viernes/organizations  List orgs          ║
║  - GET  /api/viernes/agents/:id   List agents by org   ║
║  - GET  /api/elevenlabs/agents    List ElevenLabs agents║
╚════════════════════════════════════════════════════════╝
    `);
    console.log('[STARTUP] 🎉 Application started successfully');
  });

  return serverInstance;
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  // Prevent multiple shutdown calls
  if (isShuttingDown) {
    console.log(`[SHUTDOWN] ${signal} received but shutdown already in progress, ignoring...`);
    return;
  }
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] ${signal} received. Starting graceful shutdown...`);
  const shutdownStartTime = Date.now();

  // Timeout de seguridad: forzar exit después de 30s
  const shutdownTimeout = setTimeout(() => {
    console.error('[SHUTDOWN] ❌ Shutdown timeout exceeded (30s), forcing exit');
    process.exit(1);
  }, 30000);

  try {
    // 1. Dejar de aceptar nuevas conexiones HTTP
    if (serverInstance) {
      console.log('[SHUTDOWN] Step 1/2: Closing HTTP server...');
      const httpStartTime = Date.now();
      await new Promise<void>((resolve) => {
        serverInstance!.close(() => {
          const httpDuration = Date.now() - httpStartTime;
          console.log(`[SHUTDOWN] ✅ HTTP server closed in ${httpDuration}ms`);
          resolve();
        });
      });
    }

    // 2. Cerrar pool de conexiones MySQL
    console.log('[SHUTDOWN] Step 2/2: Closing database connections...');
    await database.close();

    clearTimeout(shutdownTimeout);
    const totalDuration = Date.now() - shutdownStartTime;
    console.log(`[SHUTDOWN] ✅ Graceful shutdown completed successfully in ${totalDuration}ms`);
    process.exit(0);
  } catch (error) {
    console.error('[SHUTDOWN] ❌ Error during graceful shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// Start the server with error handling
try {
  await start();

  // Register signal handlers
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
