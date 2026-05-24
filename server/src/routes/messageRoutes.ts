import { Router } from 'express';
import { createMessage, listMessages, getConversations } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = Router();

router.use(requireAuth);
router.get('/', listMessages);
router.post('/', createMessage);
router.get('/conversations', getConversations); // Add this line

export default router;