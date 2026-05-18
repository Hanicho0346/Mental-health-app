import { Router } from 'express';
import { getPublicConfig } from '../controllers/configController.js';

const router = Router();

router.get('/public', getPublicConfig);

export default router;
