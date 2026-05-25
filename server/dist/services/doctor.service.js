"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const cloudinary_1 = require("cloudinary");
const mongoose_1 = __importDefault(require("mongoose"));
const index_js_1 = __importDefault(require("../models/index.js"));
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
async function safeUnlinkTemp(filePath) {
    if (!filePath)
        return;
    try {
        await promises_1.default.unlink(filePath);
    }
    catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
        if (code !== 'ENOENT') {
            console.warn('doctor.uploadVideoData: failed to remove temp upload', err);
        }
    }
}
function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `${days}d ago`;
    if (hours > 0)
        return `${hours}h ago`;
    if (minutes > 0)
        return `${minutes}m ago`;
    return 'Just now';
}
function psychiatristFilter(doctorId) {
    return { psychiatrist_user_id: new mongoose_1.default.Types.ObjectId(doctorId) };
}
class DoctorService {
    async getDashboardStats(doctorId) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const doctorOid = new mongoose_1.default.Types.ObjectId(doctorId);
        const [appointmentsToday, patientIds, unreadMessagesCount, urgentAlertsCount] = await Promise.all([
            index_js_1.default.Appointment.countDocuments({
                ...psychiatristFilter(doctorId),
                scheduled_at: {
                    $gte: startOfToday,
                    $lte: endOfToday,
                },
            }),
            index_js_1.default.Appointment.distinct('user_id', psychiatristFilter(doctorId)),
            index_js_1.default.Message.countDocuments({
                receiver_id: doctorOid,
                is_read: { $ne: true },
            }),
            index_js_1.default.Alert.countDocuments({
                doctor_id: doctorOid,
                is_resolved: false,
                priority: 'URGENT',
            }),
        ]);
        return {
            appointmentsToday,
            patientsCount: patientIds.length,
            unreadMessagesCount,
            urgentAlertsCount,
        };
    }
    async getUrgentAlerts(doctorId) {
        const doctorOid = new mongoose_1.default.Types.ObjectId(doctorId);
        const alerts = await index_js_1.default.Alert.find({
            doctor_id: doctorOid,
            is_resolved: false,
            priority: 'URGENT',
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('patient_id', 'full_name avatar_url')
            .lean()
            .exec();
        return alerts.map((alert) => {
            const populated = alert.patient_id && 'full_name' in alert.patient_id ? alert.patient_id : null;
            const patientOid = populated?._id ?? (alert.patient_id instanceof mongoose_1.default.Types.ObjectId ? alert.patient_id : null);
            return {
                id: alert._id.toString(),
                patientId: patientOid ? patientOid.toString() : '',
                patientName: populated?.full_name?.trim() || 'Unknown',
                status: alert.message || 'Urgent Alert',
                time: formatTimeAgo(alert.createdAt),
            };
        });
    }
    async getAppointmentsForDate(doctorId, targetDate) {
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        const appointments = (await index_js_1.default.Appointment.find({
            ...psychiatristFilter(doctorId),
            scheduled_at: {
                $gte: startOfDay,
                $lte: endOfDay,
            },
        })
            .populate('user_id', 'full_name avatar_url')
            .lean()
            .exec());
        return appointments.map((appt) => {
            const populated = appt.user_id && 'full_name' in appt.user_id ? appt.user_id : null;
            const userOid = populated?._id ?? (appt.user_id instanceof mongoose_1.default.Types.ObjectId ? appt.user_id : null);
            return {
                id: appt._id.toString(),
                patientId: userOid ? userOid.toString() : '',
                patientName: populated?.full_name?.trim() || 'Unknown',
                avatar: populated?.avatar_url?.trim() || '',
                time: appt.time_label ?? '',
                type: appt.appointment_type?.trim() || 'Video Call',
                notes: typeof appt.notes === 'string' && appt.notes.trim() ? appt.notes.trim() : null,
            };
        });
    }
    async listPatientsForPsychiatrist(doctorId) {
        const patientIds = await index_js_1.default.Appointment.distinct('user_id', psychiatristFilter(doctorId));
        if (patientIds.length === 0) {
            return [];
        }
        const users = await index_js_1.default.User.find({ _id: { $in: patientIds } })
            .select('full_name avatar_url mood_status')
            .sort({ full_name: 1 })
            .lean()
            .exec();
        return users.map((u) => ({
            id: u._id.toString(),
            full_name: u.full_name,
            avatar_url: u.avatar_url?.trim() ?? '',
            mood_status: u.mood_status?.trim() ?? '',
        }));
    }
    async getPatientProfileForPsychiatrist(doctorId, patientId) {
        const hasAppointment = await index_js_1.default.Appointment.exists({
            ...psychiatristFilter(doctorId),
            user_id: new mongoose_1.default.Types.ObjectId(patientId),
        });
        if (!hasAppointment) {
            return null;
        }
        const user = await index_js_1.default.User.findById(patientId)
            .select('full_name avatar_url mood_status email')
            .lean()
            .exec();
        if (!user) {
            return null;
        }
        return {
            id: user._id.toString(),
            full_name: user.full_name,
            avatar_url: user.avatar_url?.trim() ?? '',
            mood_status: user.mood_status?.trim() ?? '',
            email: user.email,
        };
    }
    async uploadVideoData(doctorId, videoData) {
        const { title, amharicTitle, tag, file } = videoData;
        if (!file?.path) {
            throw new Error('Upload file path missing');
        }
        try {
            const uploaded = await cloudinary_1.v2.uploader.upload_large(file.path, {
                resource_type: 'video',
                folder: 'psychiatry_support_videos',
                chunk_size: 6000000,
            });
            if (!uploaded || typeof uploaded !== 'object' || !('secure_url' in uploaded)) {
                throw new Error('Invalid Cloudinary upload response');
            }
            const videoUrl = String(uploaded.secure_url);
            const docPayload = {
                doctor_id: new mongoose_1.default.Types.ObjectId(doctorId),
                title: title.trim() || 'Untitled',
                amharic_title: amharicTitle.trim(),
                category: tag.trim(),
                video_url: videoUrl,
            };
            const newVideo = await index_js_1.default.Video.create(docPayload);
            return newVideo.toObject();
        }
        catch (err) {
            console.error('Cloudinary Upload Error Details:', err);
            throw new Error(err instanceof Error ? err.message : 'Failed to upload video to Cloudinary');
        }
        finally {
            await safeUnlinkTemp(file.path);
        }
    }
    async getSupportVideos() {
        const videos = await index_js_1.default.Video.find()
            .sort({ createdAt: -1 })
            .lean()
            .exec();
        return videos.map((video) => ({
            id: video._id.toString(),
            title: video.title,
            amharic_title: video.amharic_title,
            category: video.category,
            video_url: video.video_url,
            createdAt: video.createdAt,
        }));
    }
}
exports.default = new DoctorService();
