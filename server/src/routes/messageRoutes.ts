import { Router } from 'express';
import { createMessage, listMessages, getConversations } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requirePaidConversation } from '../middleware/requirePaidConversation.js'; 
const router = Router();

router.use(requireAuth,requirePaidConversation);
router.get('/', listMessages);
router.post('/', createMessage);
router.get('/conversations', getConversations); // Add this line

export default router;