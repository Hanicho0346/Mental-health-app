"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const doctor_controller_js_1 = require("../controllers/doctor.controller.js");
const authenticate_js_1 = require("../middleware/authenticate.js");
const requireApprovedPsychiatrist_js_1 = require("../middleware/requireApprovedPsychiatrist.js");
const router = express_1.default.Router();
const doctorGate = [authenticate_js_1.requireAuth, requireApprovedPsychiatrist_js_1.requirePsychiatristAccess];
router.get('/dashboard/stats', ...doctorGate, doctor_controller_js_1.getDashboardStats);
router.get('/dashboard/alerts', ...doctorGate, doctor_controller_js_1.getUrgentAlerts);
router.get('/appointments/today', ...doctorGate, doctor_controller_js_1.getTodayAppointments);
router.get('/appointments/date', ...doctorGate, doctor_controller_js_1.getAppointmentsByDate);
/** @deprecated Prefer GET /appointments/date */
router.get('/appointments', ...doctorGate, doctor_controller_js_1.getAppointmentsByDate);
router.get('/patients/:patientId', ...doctorGate, doctor_controller_js_1.getPatientProfile);
router.get('/patients', ...doctorGate, doctor_controller_js_1.getPatients);
router.get('/videos/sign', ...doctorGate, doctor_controller_js_1.getCloudinarySignature);
router.post('/videos/save', ...doctorGate, doctor_controller_js_1.saveVideoRecord);
router.get('/videos', doctor_controller_js_1.getSupportVideos);
router.post('/videos/:id/listen', doctor_controller_js_1.incrementVideoListen);
router.post('/videos/:id/toggle-favorite', authenticate_js_1.requireAuth, doctor_controller_js_1.toggleVideoFavorite);
exports.default = router;
