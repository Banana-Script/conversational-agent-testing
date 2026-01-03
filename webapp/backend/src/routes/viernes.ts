import { Router, Request, Response } from 'express';
import { database } from '../services/database.js';

const router = Router();

// GET /api/viernes/organizations
router.get('/organizations', async (_req: Request, res: Response) => {
  try {
    const organizations = await database.getOrganizations();
    res.json(organizations);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// GET /api/viernes/agents/:orgId
router.get('/agents/:orgId', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (isNaN(orgId)) {
      res.status(400).json({ error: 'Invalid organization ID' });
      return;
    }
    const agents = await database.getAgentsByOrganization(orgId);
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

export default router;
