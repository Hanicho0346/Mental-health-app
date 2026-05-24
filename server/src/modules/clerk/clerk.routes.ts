import { Router } from 'express';
import { requireClerkSession } from '../../middleware/resolveAuth.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { clerkSyncSchema } from './clerk.schemas.js';
import { clerkSync } from './clerk.controller.js';

const router = Router();

router.post('/sync', authRateLimiter(), requireClerkSession, validateBody(clerkSyncSchema), clerkSync);

export default router;
