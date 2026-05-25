"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const doctor_controller_js_1 = require("../controllers/doctor.controller.js");
const authenticate_js_1 = require("../middleware/authenticate.js");
const requireApprovedPsychiatrist_js_1 = require("../middleware/requireApprovedPsychiatrist.js");
const router = express_1.default.Router();
const doctorGate = [authenticate_js_1.requireAuth, requireApprovedPsychiatrist_js_1.requirePsychiatristAccess];
if (!fs_1.default.existsSync('uploads/')) {
    fs_1.default.mkdirSync('uploads/', { recursive: true });
}
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 },
});
router.get('/dashboard/stats', ...doctorGate, doctor_controller_js_1.getDashboardStats);
router.get('/dashboard/alerts', ...doctorGate, doctor_controller_js_1.getUrgentAlerts);
router.get('/appointments/today', ...doctorGate, doctor_controller_js_1.getTodayAppointments);
router.get('/appointments/date', ...doctorGate, doctor_controller_js_1.getAppointmentsByDate);
/** @deprecated Prefer GET /appointments/date */
router.get('/appointments', ...doctorGate, doctor_controller_js_1.getAppointmentsByDate);
router.get('/patients/:patientId', ...doctorGate, doctor_controller_js_1.getPatientProfile);
router.get('/patients', ...doctorGate, doctor_controller_js_1.getPatients);
router.post('/videos/upload', ...doctorGate, upload.single('video'), doctor_controller_js_1.uploadSupportVideo);
router.get('/videos', authenticate_js_1.requireAuth, doctor_controller_js_1.getSupportVideos);
exports.default = router;
