import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { requireApprovedPsychiatrist } from '../../middleware/requireApprovedPsychiatrist.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { bookAppointmentSchema } from '../../validators/appointment.schemas.js';
import {
  createAppointment,
  listAssignedAppointments,
  listCounselors,
  listMyAppointments,
} from './appointment.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/counselors', listCounselors);
router.get('/assigned', requireApprovedPsychiatrist, listAssignedAppointments);
router.get('/', listMyAppointments);
router.post('/', validateBody(bookAppointmentSchema), createAppointment);

export default router;
