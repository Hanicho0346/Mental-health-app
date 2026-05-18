import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { getMe, getPeerPublic, patchMe } from './user.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/me', getMe);
router.patch('/me', patchMe);
router.get('/peer/:peerId', getPeerPublic);

export default router;
