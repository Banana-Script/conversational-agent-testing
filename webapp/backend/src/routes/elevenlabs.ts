import { Router, Request, Response } from 'express';
import { getElevenLabsAgents } from '../services/elevenlabs-service.js';

const router = Router();

// GET /api/elevenlabs/agents?forceRefresh=true
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.forceRefresh === 'true';
    const agents = await getElevenLabsAgents(forceRefresh);
    res.json(agents);
  } catch (error) {
    console.error('Error fetching ElevenLabs agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

export default router;
