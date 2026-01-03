import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import multer from 'multer';

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

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
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

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    claudeToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'configured' : 'missing',
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
async function start() {
  try {
    // Initialize Claude executor
    await claudeExecutor.initialize();
    console.log('Claude executor initialized');
  } catch (error) {
    console.warn('Claude executor initialization warning:', error);
  }

  try {
    // Initialize database connection (waits for SSH tunnel)
    await database.initialize();
    console.log('Database connection established');
  } catch (error) {
    console.warn('Database initialization warning:', error);
  }

  app.listen(PORT, () => {
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
  });
}

start();
