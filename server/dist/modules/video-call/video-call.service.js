"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoCallService = exports.VideoCallService = void 0;
const node_crypto_1 = require("node:crypto");
const mongoose_1 = __importDefault(require("mongoose"));
const ConsultationSession_js_1 = require("../../models/ConsultationSession.js");
const Appointment_js_1 = require("../../models/Appointment.js");
const AppError_js_1 = require("../../utils/AppError.js");
/**
 * Prepares consultation room records for appointment-based video calls.
 * WebRTC signaling is not implemented — clients will use `roomId` when ready.
 */
class VideoCallService {
    getSignalingConfig() {
        const turnUrl = process.env.WEBRTC_TURN_URL?.trim();
        const stunUrl = process.env.WEBRTC_STUN_URL?.trim() ?? 'stun:stun.l.google.com:19302';
        const iceServers = [{ urls: stunUrl }];
        if (turnUrl) {
            iceServers.push({
                urls: turnUrl,
                username: process.env.WEBRTC_TURN_USERNAME,
                credential: process.env.WEBRTC_TURN_CREDENTIAL,
            });
        }
        return { iceServers, enabled: Boolean(process.env.WEBRTC_ENABLED === 'true') };
    }
    async ensureSessionForAppointment(appointmentId, psychiatristUserId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(appointmentId)) {
            throw new AppError_js_1.AppError(400, 'Invalid appointment id');
        }
        const appt = await Appointment_js_1.Appointment.findById(appointmentId).lean();
        if (!appt) {
            throw new AppError_js_1.AppError(404, 'Appointment not found');
        }
        if (appt.psychiatrist_user_id?.toString() !== psychiatristUserId) {
            throw new AppError_js_1.AppError(403, 'Not your appointment');
        }
        if (!appt.user_id) {
            throw new AppError_js_1.AppError(400, 'Appointment has no patient');
        }
        let session = await ConsultationSession_js_1.ConsultationSession.findOne({ appointment_id: appt._id });
        if (!session) {
            session = await ConsultationSession_js_1.ConsultationSession.create({
                appointment_id: appt._id,
                psychiatrist_user_id: appt.psychiatrist_user_id,
                patient_user_id: appt.user_id,
                room_id: `consult-${(0, node_crypto_1.randomBytes)(12).toString('hex')}`,
                scheduled_at: appt.scheduled_at ?? new Date(),
                webrtc_config: this.getSignalingConfig(),
            });
        }
        return {
            id: session._id.toString(),
            appointmentId: appt._id.toString(),
            roomId: session.room_id,
            status: session.status,
            scheduledAt: session.scheduled_at.toISOString(),
            psychiatristUserId: session.psychiatrist_user_id.toString(),
            patientUserId: session.patient_user_id.toString(),
        };
    }
}
exports.VideoCallService = VideoCallService;
exports.videoCallService = new VideoCallService();
