"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = getDashboardStats;
exports.getUrgentAlerts = getUrgentAlerts;
exports.getTodayAppointments = getTodayAppointments;
exports.getAppointmentsByDate = getAppointmentsByDate;
exports.getSupportVideos = getSupportVideos;
exports.getPatients = getPatients;
exports.getPatientProfile = getPatientProfile;
exports.getCloudinarySignature = getCloudinarySignature;
exports.saveVideoRecord = saveVideoRecord;
exports.incrementVideoListen = incrementVideoListen;
exports.toggleVideoFavorite = toggleVideoFavorite;
const mongoose_1 = __importDefault(require("mongoose"));
const doctor_service_js_1 = __importDefault(require("../services/doctor.service.js"));
function unauthorized(res) {
    res.status(401).json({ message: 'Unauthorized' });
}
async function getDashboardStats(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const stats = await doctor_service_js_1.default.getDashboardStats(req.userId);
        res.status(200).json(stats);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Failed to fetch dashboard stats',
        });
    }
}
async function getUrgentAlerts(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const alerts = await doctor_service_js_1.default.getUrgentAlerts(req.userId);
        res.status(200).json(alerts);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Failed to fetch alerts',
        });
    }
}
async function getTodayAppointments(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const appointments = await doctor_service_js_1.default.getAppointmentsForDate(req.userId, new Date());
        res.status(200).json(appointments);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Failed to fetch today's appointments",
        });
    }
}
async function getAppointmentsByDate(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const { date } = req.query;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
            res.status(400).json({ message: 'Valid date query parameter is required (YYYY-MM-DD)' });
            return;
        }
        const parsed = new Date(`${date.trim()}T12:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
            res.status(400).json({ message: 'Invalid date' });
            return;
        }
        const appointments = await doctor_service_js_1.default.getAppointmentsForDate(req.userId, parsed);
        res.status(200).json(appointments);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Failed to fetch appointments for selected date',
        });
    }
}
async function getSupportVideos(req, res) {
    try {
        const videos = await doctor_service_js_1.default.getSupportVideos();
        res.status(200).json(videos);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch videos' });
    }
}
async function getPatients(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const patients = await doctor_service_js_1.default.listPatientsForPsychiatrist(req.userId);
        res.status(200).json(patients);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch patients list' });
    }
}
async function getPatientProfile(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const { patientId } = req.params;
        if (!patientId || !mongoose_1.default.Types.ObjectId.isValid(patientId)) {
            res.status(400).json({ message: 'Valid patient id is required' });
            return;
        }
        const profile = await doctor_service_js_1.default.getPatientProfileForPsychiatrist(req.userId, patientId);
        if (!profile) {
            res.status(404).json({ message: 'Patient not found or not linked to your practice' });
            return;
        }
        res.status(200).json(profile);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch patient profile' });
    }
}
async function getCloudinarySignature(req, res) {
    if (!req.userId || !req.auth) {
        unauthorized(res);
        return;
    }
    try {
        const signature = await doctor_service_js_1.default.generateUploadSignature();
        res.status(200).json(signature);
    }
    catch (err) {
        res.status(500).json({ message: 'Failed to generate upload signature' });
    }
}
async function saveVideoRecord(req, res) {
    if (!req.userId || !req.auth) {
        unauthorized(res);
        return;
    }
    try {
        const { title, amharicTitle, tag, videoUrl, publicId } = req.body;
        if (!videoUrl) {
            res.status(400).json({ message: 'videoUrl is required' });
            return;
        }
        const newVideo = await doctor_service_js_1.default.saveVideoRecord(req.userId, {
            title: title ?? '',
            amharicTitle: amharicTitle ?? '',
            tag: tag ?? '',
            videoUrl,
            publicId,
        });
        res.status(201).json({ message: 'Video saved successfully', video: newVideo });
    }
    catch (err) {
        console.error('Controller Error:', err);
        res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to save video' });
    }
}
async function incrementVideoListen(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid video id' });
            return;
        }
        const video = await doctor_service_js_1.default.incrementListen(id);
        if (!video) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.status(200).json({ listens: video.listens });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update listen count' });
    }
}
async function toggleVideoFavorite(req, res) {
    try {
        if (!req.userId || !req.auth) {
            unauthorized(res);
            return;
        }
        const { id } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: 'Invalid video id' });
            return;
        }
        const result = await doctor_service_js_1.default.toggleFavorite(id, req.userId);
        if (!result) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.status(200).json({ isFavorite: result.isFavorite });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to toggle favorite' });
    }
}
