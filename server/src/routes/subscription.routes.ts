import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';

import {
  initiatePremierHandler,
  verifyPremierHandler,
  chapaSubscriptionCallbackHandler,
} from '../controllers/subscription.controller.js';

const router = Router();

router.post(
  '/premier/initiate',
  requireAuth,
  initiatePremierHandler
);

router.get(
  '/verify/:tx_ref',
  requireAuth,
  verifyPremierHandler
);

router.post(
  '/chapa/callback',
  chapaSubscriptionCallbackHandler
);

export default router;