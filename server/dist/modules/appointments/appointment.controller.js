"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppointment = exports.listAssignedAppointments = exports.listMyAppointments = exports.listAvailableSlots = exports.listCounselors = void 0;
const AppError_js_1 = require("../../utils/AppError.js");
const logger_js_1 = require("../../utils/logger.js");
const appointmentService = __importStar(require("./appointment.service.js"));
const booking_1 = require("../../models/booking");
const listCounselors = async (_req, res, next) => {
    try {
        res.json(await appointmentService.listPublicCounselors());
    }
    catch (err) {
        next(err);
    }
};
exports.listCounselors = listCounselors;
// In your appointment.controller.ts — add this new handler
/**
 * GET /api/appointments/slots?psychiatrist_id=X&date=YYYY-MM-DD
 *
 * Returns all time slots for a given psychiatrist + date,
 * marking each as booked:true if a paid booking exists for that time.
 * Used by the booking screen to prevent double-booking.
 */
const listAvailableSlots = async (req, res, next) => {
    try {
        const { psychiatrist_id, date } = req.query;
        if (!psychiatrist_id || !date) {
            res.status(400).json({ error: 'psychiatrist_id and date are required' });
            return;
        }
        const TIME_OPTIONS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        const bookedRecords = await booking_1.Booking.find({
            psychiatrist_id,
            scheduled_at: { $gte: dayStart, $lte: dayEnd },
            payment_status: 'paid',
        }).select('scheduled_at').lean();
        const bookedTimes = new Set(bookedRecords.map((b) => {
            const d = new Date(b.scheduled_at); // fix: cast to Date
            const hh = String(d.getUTCHours()).padStart(2, '0');
            const mm = String(d.getUTCMinutes()).padStart(2, '0');
            return `${hh}:${mm}`;
        }));
        const slots = TIME_OPTIONS.map((time) => ({
            time,
            booked: bookedTimes.has(time),
        }));
        res.json({ slots });
    }
    catch (err) {
        next(err);
    }
};
exports.listAvailableSlots = listAvailableSlots;
const listMyAppointments = async (req, res, next) => {
    try {
        if (!req.auth || !req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const role = req.auth.role;
        const rows = await appointmentService.listAppointmentsForActor(req.userId, role);
        res.json(rows);
    }
    catch (err) {
        (0, logger_js_1.logServerError)('listMyAppointments', err, { userId: req.userId });
        next(err);
    }
};
exports.listMyAppointments = listMyAppointments;
/** Approved psychiatrists only — see `requireApprovedPsychiatrist` on the route. */
const listAssignedAppointments = async (req, res, next) => {
    try {
        if (!req.userId || !req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const rows = await appointmentService.listAppointmentsForActor(req.userId, 'psychiatrist');
        res.json(rows);
    }
    catch (err) {
        (0, logger_js_1.logServerError)('listAssignedAppointments', err, { userId: req.userId });
        next(err);
    }
};
exports.listAssignedAppointments = listAssignedAppointments;
const createAppointment = async (req, res, next) => {
    try {
        if (!req.auth || !req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const role = req.auth.role;
        if (role === 'psychiatrist') {
            res.status(403).json({ error: 'Use provider endpoints to manage assigned appointments' });
            return;
        }
        const body = req.body;
        const created = await appointmentService.createPatientAppointment(req.userId, body);
        res.status(201).json(created);
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError && err.status === 400) {
            res.status(400).json({ error: err.message });
            return;
        }
        (0, logger_js_1.logServerError)('createAppointment', err, { userId: req.userId, body: req.body });
        next(err);
    }
};
exports.createAppointment = createAppointment;
