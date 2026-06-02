import type { Request, Response } from 'express';
import mongoose from 'mongoose';

import doctorService from '../services/doctor.service.js';

function unauthorized(res: Response): void {
  res.status(401).json({ message: 'Unauthorized' });
}

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    if (!req.userId || !req.auth) {
      unauthorized(res);
      return;
    }
    const stats = await doctorService.getDashboardStats(req.userId);
    res.status(200).json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Failed to fetch dashboard stats',
    });
  }
}

export async function getUrgentAlerts(req: Request, res: Response): Promise<void> {
  try {
    if (!req.userId || !req.auth) {
      unauthorized(res);
      return;
    }
    const alerts = await doctorService.getUrgentAlerts(req.userId);
    res.status(200).json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Failed to fetch alerts',
    });
  }
}

export async function getTodayAppointments(req: Request, res: Response): Promise<void> {
  try {
    if (!req.userId || !req.auth) {
      unauthorized(res);
      return;
    }
    const appointments = await doctorService.getAppointmentsForDate(req.userId, new Date());
    res.status(200).json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch today's appointments",
    });
  }
}

export async function getAppointmentsByDate(req: Request, res: Response): Promise<void> {
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
    const appointments = await doctorService.getAppointmentsForDate(req.userId, parsed);
    res.status(200).json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Failed to fetch appointments for selected date',
    });
  }
}
export async function getSupportVideos(req: Request, res: Response): Promise<void> {
  try {
    const videos = await doctorService.getSupportVideos();
    res.status(200).json(videos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch videos' });
  }
}

export async function getPatients(req: Request, res: Response): Promise<void> {
  try {
    if (!req.userId || !req.auth) {
      unauthorized(res);
      return;
    }
    const patients = await doctorService.listPatientsForPsychiatrist(req.userId);
    res.status(200).json(patients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch patients list' });
  }
}

export async function getPatientProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.userId || !req.auth) {
      unauthorized(res);
      return;
    }
    const { patientId } = req.params;
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      res.status(400).json({ message: 'Valid patient id is required' });
      return;
    }
    const profile = await doctorService.getPatientProfileForPsychiatrist(req.userId, patientId);
    if (!profile) {
      res.status(404).json({ message: 'Patient not found or not linked to your practice' });
      return;
    }
    res.status(200).json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch patient profile' });
  }
}

export async function getCloudinarySignature(req: Request, res: Response): Promise<void> {
  if (!req.userId || !req.auth) { unauthorized(res); return; }
  try {
    const signature = await doctorService.generateUploadSignature();
    res.status(200).json(signature);
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate upload signature' });
  }
}

export async function saveVideoRecord(req: Request, res: Response): Promise<void> {
  if (!req.userId || !req.auth) { unauthorized(res); return; }
  try {
    const { title, amharicTitle, tag, videoUrl, publicId } = req.body as Record<string, string>;
    if (!videoUrl) { res.status(400).json({ message: 'videoUrl is required' }); return; }
    const newVideo = await doctorService.saveVideoRecord(req.userId, {
      title: title ?? '',
      amharicTitle: amharicTitle ?? '',
      tag: tag ?? '',
      videoUrl,
      publicId,
    });
    res.status(201).json({ message: 'Video saved successfully', video: newVideo });
  } catch (err) {
    console.error('Controller Error:', err);
    res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to save video' });
  }
}

export async function incrementVideoListen(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid video id' });
      return;
    }
    const video = await doctorService.incrementListen(id);
    if (!video) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ listens: video.listens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update listen count' });
  }
}

export async function toggleVideoFavorite(req: Request, res: Response): Promise<void> {
  try {
    if (!req.userId || !req.auth) {
      unauthorized(res);
      return;
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid video id' });
      return;
    }
    const result = await doctorService.toggleFavorite(id, req.userId);
    if (!result) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ isFavorite: result.isFavorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to toggle favorite' });
  }
}