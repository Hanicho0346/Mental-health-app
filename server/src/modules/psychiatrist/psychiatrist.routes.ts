import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { memoryUpload } from '../../modules/uploads/multer.config.js';
import { psychiatristProfileUpdateSchema, psychiatristVerificationSchema } from '../../validators/psychiatrist.schemas.js';
import { getVerificationStatus, submitVerification, uploadDocument ,getFullProfile, 
   getPsychiatristWallet,          
  getPsychiatristTransactions,  } from './psychiatrist.controller.js';

const router = Router();

router.use(requireAuth, requireRole('psychiatrist'));

router.get('/verification/status', getVerificationStatus);
router.get('/profile', getFullProfile); 
router.get('/wallet', getPsychiatristWallet);                           
router.get('/wallet/transactions', getPsychiatristTransactions); 
router.post('/verification/submit', validateBody(psychiatristProfileUpdateSchema), submitVerification);
router.post(
  '/verification/documents',
  memoryUpload.single('document'),
  validateBody(psychiatristVerificationSchema),
  uploadDocument
);

export default router;
