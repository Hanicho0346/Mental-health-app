import { Router } from 'express';
import { createMessage, listMessages, getConversations } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requirePaidConversation } from '../middleware/requirePaidConversation.js'; 

const router = Router();

// ── No booking gate — just auth ───────────────────────────────────────────────
router.get('/conversations', requireAuth, getConversations);

// ── Booking gate applies to sending/reading individual messages only ──────────
router.use(requireAuth, requirePaidConversation);
router.get('/', listMessages);
router.post('/', createMessage);

export default router;