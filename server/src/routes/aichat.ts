import express from 'express';

import { requireAuth } from '../middleware/authenticate.js';
import { requirePremier } from '../middleware/requirePremier.js';

import {
  sendMessage,
  getHistory,
  clearHistory,
} from '../controllers/aichatController.js';

const router = express.Router();

router.post(
  '/message',
  requireAuth,
  requirePremier,
  sendMessage
);

router.get(
  '/history',
  requireAuth,
  requirePremier,
  getHistory
);

router.delete(
  '/history',
  requireAuth,
  requirePremier,
  clearHistory
);

export default router;