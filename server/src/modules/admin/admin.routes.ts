import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import {
  approvePsychiatrist,
  listPendingPsychiatrists,
  listApprovedPsychiatrists,
  rejectPsychiatrist,
  getAdminStats,
  listAllUsers,
  getWallet,
    listAllPsychiatrists,
} from './admin.controller.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats',                       getAdminStats);
router.get('/users',                       listAllUsers);
router.get('/wallet',                      getWallet);
router.get('/psychiatrists',           listAllPsychiatrists);
router.get('/psychiatrists/pending',       listPendingPsychiatrists);
router.get('/psychiatrists/approved',      listApprovedPsychiatrists);
router.post('/psychiatrists/:id/approve',  approvePsychiatrist);
router.post('/psychiatrists/:id/reject',   rejectPsychiatrist);

export default router;