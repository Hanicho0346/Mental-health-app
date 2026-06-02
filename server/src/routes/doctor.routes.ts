import express from 'express';

import {
  getAppointmentsByDate,
  getDashboardStats,
  getPatientProfile,
  getPatients,
  getTodayAppointments,
  getUrgentAlerts,
  getCloudinarySignature,
  saveVideoRecord,
  getSupportVideos,
  incrementVideoListen,
  toggleVideoFavorite,
} from '../controllers/doctor.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requirePsychiatristAccess } from '../middleware/requireApprovedPsychiatrist.js';

const router = express.Router();

const doctorGate = [requireAuth, requirePsychiatristAccess];

router.get('/dashboard/stats', ...doctorGate, getDashboardStats);
router.get('/dashboard/alerts', ...doctorGate, getUrgentAlerts);
router.get('/appointments/today', ...doctorGate, getTodayAppointments);
router.get('/appointments/date', ...doctorGate, getAppointmentsByDate);
/** @deprecated Prefer GET /appointments/date */
router.get('/appointments', ...doctorGate, getAppointmentsByDate);
router.get('/patients/:patientId', ...doctorGate, getPatientProfile);
router.get('/patients', ...doctorGate, getPatients);
router.get('/videos/sign', ...doctorGate, getCloudinarySignature);
router.post('/videos/save', ...doctorGate, saveVideoRecord);
router.get('/videos', getSupportVideos);
router.post('/videos/:id/listen', incrementVideoListen);
router.post('/videos/:id/toggle-favorite', requireAuth, toggleVideoFavorite);

export default router;
