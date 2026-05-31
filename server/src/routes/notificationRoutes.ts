import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);
router.get('/unread-count', getUnreadCount);

export default router;