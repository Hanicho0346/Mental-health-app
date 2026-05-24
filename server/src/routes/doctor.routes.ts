import express from 'express';
import fs from 'fs';
import multer from 'multer';

import {
  getAppointmentsByDate,
  getDashboardStats,
  getPatientProfile,
  getPatients,
  getTodayAppointments,
  getUrgentAlerts,
  uploadSupportVideo,
  getSupportVideos,
} from '../controllers/doctor.controller.js';
import { requireAuth } from '../middleware/authenticate.js';
import { requirePsychiatristAccess } from '../middleware/requireApprovedPsychiatrist.js';

const router = express.Router();

const doctorGate = [requireAuth, requirePsychiatristAccess];

if (!fs.existsSync('uploads/')) {
  fs.mkdirSync('uploads/', { recursive: true });
}

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get('/dashboard/stats', ...doctorGate, getDashboardStats);
router.get('/dashboard/alerts', ...doctorGate, getUrgentAlerts);
router.get('/appointments/today', ...doctorGate, getTodayAppointments);
router.get('/appointments/date', ...doctorGate, getAppointmentsByDate);
/** @deprecated Prefer GET /appointments/date */
router.get('/appointments', ...doctorGate, getAppointmentsByDate);
router.get('/patients/:patientId', ...doctorGate, getPatientProfile);
router.get('/patients', ...doctorGate, getPatients);
router.post('/videos/upload', ...doctorGate, upload.single('video'), uploadSupportVideo);
router.get('/videos', requireAuth, getSupportVideos);

export default router;
