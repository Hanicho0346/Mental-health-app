import type { RequestHandler } from 'express';
import { AppError } from '../../utils/AppError.js';
import { logServerError } from '../../utils/logger.js';
import * as appointmentService from './appointment.service.js';

import  {Booking}  from '../../models/booking'; 
export const listCounselors: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await appointmentService.listPublicCounselors());
  } catch (err) {
    next(err);
  }
};
// In your appointment.controller.ts — add this new handler



/**
 * GET /api/appointments/slots?psychiatrist_id=X&date=YYYY-MM-DD
 *
 * Returns all time slots for a given psychiatrist + date,
 * marking each as booked:true if a paid booking exists for that time.
 * Used by the booking screen to prevent double-booking.
 */
export const listAvailableSlots = async (req: Request, res: Response): Promise<void> => {
  const { psychiatrist_id, date } = req.query as { psychiatrist_id?: string; date?: string };

  if (!psychiatrist_id || !date) {
    res.status(400).json({ error: 'psychiatrist_id and date are required' });
    return;
  }

  // Fixed time slots the clinic offers
  const TIME_OPTIONS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

  // Find all paid bookings for this psychiatrist on this date
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd   = new Date(`${date}T23:59:59.999Z`);

  const bookedRecords = await Booking.find({
    psychiatrist_id,
    scheduled_at:    { $gte: dayStart, $lte: dayEnd },
    payment_status:  'paid',
  }).select('scheduled_at').lean();

  // Extract just the HH:MM from each booked record
  const bookedTimes = new Set(
    bookedRecords.map((b) => {
      const d = new Date(b.scheduled_at);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    })
  );

  const slots = TIME_OPTIONS.map((time) => ({
    time,
    booked: bookedTimes.has(time),
  }));

  res.json({ slots });
};
export const listMyAppointments: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth || !req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const role = req.auth.role;
    const rows = await appointmentService.listAppointmentsForActor(req.userId, role);
    res.json(rows);
  } catch (err) {
    logServerError('listMyAppointments', err, { userId: req.userId });
    next(err);
  }
};

/** Approved psychiatrists only — see `requireApprovedPsychiatrist` on the route. */
export const listAssignedAppointments: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const rows = await appointmentService.listAppointmentsForActor(req.userId, 'psychiatrist');
    res.json(rows);
  } catch (err) {
    logServerError('listAssignedAppointments', err, { userId: req.userId });
    next(err);
  }
};

export const createAppointment: RequestHandler = async (req, res, next) => {
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
    const body = req.body as { counselor_id: string; scheduled_at: string; time_label: string };
    const created = await appointmentService.createPatientAppointment(req.userId, body);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof AppError && err.status === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    logServerError('createAppointment', err, { userId: req.userId, body: req.body });
    next(err);
  }
};
