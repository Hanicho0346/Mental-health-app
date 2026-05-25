"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPublicCounselors = listPublicCounselors;
exports.resolveCounselorForBooking = resolveCounselorForBooking;
exports.listAppointmentsForActor = listAppointmentsForActor;
exports.createPatientAppointment = createPatientAppointment;
const mongoose_1 = __importDefault(require("mongoose"));
const Appointment_js_1 = require("../../models/Appointment.js");
const User_js_1 = require("../../models/User.js");
const AppError_js_1 = require("../../utils/AppError.js");
/**
 * ⚡ SINGLE SOURCE OF TRUTH (DB ONLY)
 */
async function listPublicCounselors() {
    const counselors = await User_js_1.User.find({
        role: "psychiatrist",
        verification_status: "approved",
    })
        .select("full_name avatar_url specialization")
        .lean()
        .limit(50)
        .exec();
    return counselors.map((u) => ({
        id: u._id.toString(),
        full_name: u.full_name,
        full_name_am: "",
        specialty: u.specialization?.trim() || "Licensed psychiatrist",
        specialty_am: "",
        avatar_url: u.avatar_url?.trim() ||
            "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=150&h=150&fit=crop",
        rating: 0,
        reviews: 0,
    }));
}
/**
 * ⚡ RESOLVE COUNSELOR (DB ONLY)
 */
async function resolveCounselorForBooking(counselor_id) {
    const trimmed = counselor_id.trim();
    if (!mongoose_1.default.Types.ObjectId.isValid(trimmed)) {
        throw new AppError_js_1.AppError(400, "Invalid counselor_id");
    }
    const user = await User_js_1.User.findOne({
        _id: trimmed,
        role: "psychiatrist",
        verification_status: "approved",
    })
        .select("_id full_name")
        .lean()
        .exec();
    if (!user) {
        throw new AppError_js_1.AppError(404, "Counselor not found");
    }
    return {
        counselor_id: user._id.toString(),
        counselor_name: user.full_name,
        psychiatrist_user_id: user._id,
    };
}
function mapAppointment(a) {
    return {
        id: a._id.toString(),
        counselor_id: a.counselor_id,
        counselor_name: a.counselor_name,
        scheduled_at: a.scheduled_at,
        time_label: a.time_label,
        createdAt: a.createdAt,
    };
}
/**
 * ⚡ ROLE-BASED APPOINTMENTS
 */
async function listAppointmentsForActor(userId, role) {
    const query = role === "admin"
        ? {}
        : role === "psychiatrist"
            ? { psychiatrist_user_id: new mongoose_1.default.Types.ObjectId(userId) }
            : { user_id: userId };
    const list = await Appointment_js_1.Appointment.find(query)
        .sort({ scheduled_at: 1 })
        .lean()
        .exec();
    return list.map(mapAppointment);
}
/**
 * ⚡ CREATE APPOINTMENT (SAFE)
 */
async function createPatientAppointment(patientUserId, input) {
    const resolved = await resolveCounselorForBooking(input.counselor_id);
    const scheduledAt = new Date(input.scheduled_at);
    if (isNaN(scheduledAt.getTime())) {
        throw new AppError_js_1.AppError(400, "Invalid scheduled_at date");
    }
    const doc = await Appointment_js_1.Appointment.create({
        user_id: new mongoose_1.default.Types.ObjectId(patientUserId),
        psychiatrist_user_id: resolved.psychiatrist_user_id,
        counselor_id: resolved.counselor_id,
        counselor_name: resolved.counselor_name,
        scheduled_at: scheduledAt,
        time_label: input.time_label.trim(),
    });
    return mapAppointment(doc);
}
