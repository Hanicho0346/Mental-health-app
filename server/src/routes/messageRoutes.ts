import { Router } from 'express';
import { createMessage, listMessages } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = Router();

router.use(requireAuth);
router.get('/', listMessages);
router.post('/', createMessage);

export default router;
