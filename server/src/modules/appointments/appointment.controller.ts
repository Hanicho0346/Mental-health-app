import type { RequestHandler } from 'express';
import { AppError } from '../../utils/AppError.js';
import { logServerError } from '../../utils/logger.js';
import * as appointmentService from './appointment.service.js';

export const listCounselors: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await appointmentService.listPublicCounselors());
  } catch (err) {
    next(err);
  }
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
