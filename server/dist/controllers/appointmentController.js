"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppointment = exports.listMyAppointments = exports.listCounselors = exports.COUNSELORS = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Appointment_js_1 = require("../models/Appointment.js");
const logger_js_1 = require("../utils/logger.js");
exports.COUNSELORS = [
    {
        id: 'bethlehem',
        full_name: 'Dr. Bethlehem Tadesse',
        full_name_am: 'ዶ/ር ቤተልሔም ታደሰ',
        specialty: 'Youth Trauma & Anxiety',
        specialty_am: 'የወጣቶች ስነ-ልቦና እና ጭንቀት',
        avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop',
        rating: 4.9,
        reviews: 124,
    },
    {
        id: 'amanuel',
        full_name: 'Amanuel Kebede',
        full_name_am: 'አማኑኤል ከበደ',
        specialty: 'Relationship & Family',
        specialty_am: 'የቤተሰብ እና የጥንዶች ምክር',
        avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop',
        rating: 4.8,
        reviews: 98,
    },
];
function findCounselor(id) {
    return exports.COUNSELORS.find((c) => c.id === id);
}
const listCounselors = (_req, res) => {
    res.json(exports.COUNSELORS.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        full_name_am: c.full_name_am,
        specialty: c.specialty,
        specialty_am: c.specialty_am,
        avatar_url: c.avatar_url,
        rating: c.rating,
        reviews: c.reviews,
    })));
};
exports.listCounselors = listCounselors;
const listMyAppointments = async (req, res) => {
    try {
        const uid = req.userId;
        const list = await Appointment_js_1.Appointment.find({ user_id: uid }).sort({ scheduled_at: 1 }).lean();
        res.json(list.map((a) => ({
            id: a._id.toString(),
            counselor_id: a.counselor_id,
            counselor_name: a.counselor_name,
            scheduled_at: a.scheduled_at,
            time_label: a.time_label,
            createdAt: a.createdAt,
        })));
    }
    catch (err) {
        (0, logger_js_1.logServerError)('listMyAppointments', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to load appointments' });
    }
};
exports.listMyAppointments = listMyAppointments;
const createAppointment = async (req, res) => {
    try {
        const { counselor_id, scheduled_at, time_label } = req.body;
        const counselor = findCounselor(counselor_id);
        if (!counselor) {
            res.status(400).json({ error: 'Unknown counselor_id' });
            return;
        }
        const when = new Date(scheduled_at);
        const label = time_label.trim();
        const doc = await Appointment_js_1.Appointment.create({
            user_id: new mongoose_1.default.Types.ObjectId(req.userId),
            counselor_id: counselor.id,
            counselor_name: counselor.full_name,
            scheduled_at: when,
            time_label: label,
        });
        res.status(201).json({
            id: doc._id.toString(),
            counselor_id: doc.counselor_id,
            counselor_name: doc.counselor_name,
            scheduled_at: doc.scheduled_at,
            time_label: doc.time_label,
            createdAt: doc.createdAt,
        });
    }
    catch (err) {
        (0, logger_js_1.logServerError)('createAppointment', err, { userId: req.userId, body: req.body });
        res.status(500).json({ error: 'Failed to create appointment' });
    }
};
exports.createAppointment = createAppointment;
