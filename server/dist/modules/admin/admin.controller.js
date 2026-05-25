"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminBookings = exports.getAdminRevenue = exports.getWallet = exports.listAllPsychiatrists = exports.listAllUsers = exports.getAdminStats = exports.listApprovedPsychiatrists = exports.rejectPsychiatrist = exports.approvePsychiatrist = exports.listPendingPsychiatrists = void 0;
const zod_1 = require("zod");
const User_js_1 = require("../../models/User.js");
const PsychiatristProfile_js_1 = require("../../models/PsychiatristProfile.js");
const psychiatrist_service_js_1 = require("../psychiatrist/psychiatrist.service.js");
const booking_service_js_1 = require("../../controllers/booking.service.js");
const reviewSchema = zod_1.z.object({
    feedback: zod_1.z.string().max(1000).optional(),
});
// ── existing (unchanged) ───────────────────────────────────────────────────────
const listPendingPsychiatrists = async (_req, res, next) => {
    try {
        const rows = await (0, psychiatrist_service_js_1.listPendingPsychiatristsForAdmin)();
        res.json({ pending: rows });
    }
    catch (err) {
        next(err);
    }
};
exports.listPendingPsychiatrists = listPendingPsychiatrists;
const approvePsychiatrist = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { feedback } = reviewSchema.parse(req.body);
        const result = await (0, psychiatrist_service_js_1.reviewPsychiatrist)(req.userId, req.params.id, 'approved', feedback);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
};
exports.approvePsychiatrist = approvePsychiatrist;
const rejectPsychiatrist = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { feedback } = reviewSchema.parse(req.body);
        if (!feedback?.trim()) {
            res.status(400).json({ error: 'Feedback is required when rejecting' });
            return;
        }
        const result = await (0, psychiatrist_service_js_1.reviewPsychiatrist)(req.userId, req.params.id, 'rejected', feedback);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
};
exports.rejectPsychiatrist = rejectPsychiatrist;
// ── new ────────────────────────────────────────────────────────────────────────
const listApprovedPsychiatrists = async (_req, res, next) => {
    try {
        const profiles = await PsychiatristProfile_js_1.PsychiatristProfile.find({ approval_status: 'approved' })
            .sort({ reviewed_at: -1 })
            .limit(100)
            .lean();
        const userIds = profiles.map((p) => p.user_id);
        const users = await User_js_1.User.find({ _id: { $in: userIds }, role: 'psychiatrist' })
            .select('full_name email avatar_url verification_status')
            .lean();
        const userMap = new Map(users.map((u) => [u._id.toString(), u]));
        const approved = profiles
            .map((p) => {
            const u = userMap.get(p.user_id.toString());
            if (!u)
                return null;
            return {
                id: u._id.toString(),
                full_name: u.full_name,
                email: u.email,
                status: 'approved',
                profile: {
                    specialization: p.specialization,
                    license_number: p.license_number,
                    years_of_experience: p.years_of_experience,
                },
            };
        })
            .filter(Boolean);
        res.json({ approved });
    }
    catch (err) {
        next(err);
    }
};
exports.listApprovedPsychiatrists = listApprovedPsychiatrists;
const getAdminStats = async (_req, res, next) => {
    try {
        const [total_users, total_psychiatrists, pending_count] = await Promise.all([
            User_js_1.User.countDocuments({ role: 'user' }),
            // approved psychiatrists — matches your reviewPsychiatrist() which sets is_approved
            User_js_1.User.countDocuments({ role: 'psychiatrist', is_approved: true }),
            // pending — matches listPendingPsychiatristsForAdmin() which queries PsychiatristProfile
            PsychiatristProfile_js_1.PsychiatristProfile.countDocuments({ approval_status: 'pending' }),
        ]);
        res.json({ total_users, total_psychiatrists, pending_count });
    }
    catch (err) {
        next(err);
    }
};
exports.getAdminStats = getAdminStats;
const listAllUsers = async (_req, res, next) => {
    try {
        const users = await User_js_1.User.find({ role: { $in: ['user', 'psychiatrist'] } })
            .select('full_name email role is_approved verification_status createdAt')
            .sort({ createdAt: -1 })
            .lean();
        res.json({
            users: users.map((u) => ({
                id: u._id.toString(),
                full_name: u.full_name,
                email: u.email,
                role: u.role,
                created_at: u.createdAt,
                is_active: true,
            })),
        });
    }
    catch (err) {
        next(err);
    }
};
exports.listAllUsers = listAllUsers;
const listAllPsychiatrists = async (_req, res, next) => {
    try {
        const users = await User_js_1.User.find({ role: 'psychiatrist' })
            .select('full_name email avatar_url verification_status is_approved admin_feedback specialization medical_license experience_years hospital_or_clinic createdAt is_suspended')
            .sort({ createdAt: -1 })
            .lean();
        const userIds = users.map((u) => u._id);
        const profiles = await PsychiatristProfile_js_1.PsychiatristProfile.find({ user_id: { $in: userIds } }).lean();
        const profileMap = new Map(profiles.map((p) => [p.user_id.toString(), p]));
        const psychiatrists = users.map((u) => {
            const p = profileMap.get(u._id.toString());
            return {
                id: u._id.toString(),
                full_name: u.full_name,
                email: u.email,
                avatar_url: u.avatar_url ?? '',
                verification_status: u.verification_status ?? p?.approval_status ?? 'pending',
                is_approved: u.is_approved ?? false,
                admin_feedback: u.admin_feedback ?? '',
                createdAt: u.createdAt,
                profile: {
                    specialization: p?.specialization ?? u.specialization ?? '',
                    license_number: p?.license_number ?? u.medical_license ?? '',
                    years_of_experience: p?.years_of_experience ?? u.experience_years ?? 0,
                    hospital_or_clinic: p?.hospital_or_clinic ?? u.hospital_or_clinic ?? '',
                    uploaded_documents: p?.uploaded_documents ?? [],
                },
            };
        });
        res.json({ psychiatrists });
    }
    catch (err) {
        next(err);
    }
};
exports.listAllPsychiatrists = listAllPsychiatrists;
const getWallet = async (_req, res, next) => {
    try {
        const [revenue, transactions] = await Promise.all([
            (0, booking_service_js_1.getRevenueSummary)(),
            (0, booking_service_js_1.listAllWalletTransactions)({ limit: 100 }),
        ]);
        res.json({ revenue, transactions });
    }
    catch (err) {
        next(err);
    }
};
exports.getWallet = getWallet;
const getAdminRevenue = async (_req, res, next) => {
    try {
        const summary = await (0, booking_service_js_1.getRevenueSummary)();
        res.json(summary);
    }
    catch (err) {
        next(err);
    }
};
exports.getAdminRevenue = getAdminRevenue;
const getAdminBookings = async (req, res, next) => {
    try {
        const { payment_status } = req.query;
        const bookings = await (0, booking_service_js_1.listAllBookings)({ payment_status, limit: 200 });
        res.json({ bookings });
    }
    catch (err) {
        next(err);
    }
};
exports.getAdminBookings = getAdminBookings;
