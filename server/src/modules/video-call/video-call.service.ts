import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { ConsultationSession } from '../../models/ConsultationSession.js';
import { Appointment } from '../../models/Appointment.js';
import { AppError } from '../../utils/AppError.js';
import type { ConsultationSessionDto, WebRtcSignalingConfig } from './video-call.types.js';

/**
 * Prepares consultation room records for appointment-based video calls.
 * WebRTC signaling is not implemented — clients will use `roomId` when ready.
 */
export class VideoCallService {
  getSignalingConfig(): WebRtcSignalingConfig {
    const turnUrl = process.env.WEBRTC_TURN_URL?.trim();
    const stunUrl = process.env.WEBRTC_STUN_URL?.trim() ?? 'stun:stun.l.google.com:19302';
    const iceServers: WebRtcSignalingConfig['iceServers'] = [{ urls: stunUrl }];
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        username: process.env.WEBRTC_TURN_USERNAME,
        credential: process.env.WEBRTC_TURN_CREDENTIAL,
      });
    }
    return { iceServers, enabled: Boolean(process.env.WEBRTC_ENABLED === 'true') };
  }

  async ensureSessionForAppointment(
    appointmentId: string,
    psychiatristUserId: string
  ): Promise<ConsultationSessionDto> {
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      throw new AppError(400, 'Invalid appointment id');
    }
    const appt = await Appointment.findById(appointmentId).lean();
    if (!appt) {
      throw new AppError(404, 'Appointment not found');
    }
    if (appt.psychiatrist_user_id?.toString() !== psychiatristUserId) {
      throw new AppError(403, 'Not your appointment');
    }
    if (!appt.user_id) {
      throw new AppError(400, 'Appointment has no patient');
    }

    let session = await ConsultationSession.findOne({ appointment_id: appt._id });
    if (!session) {
      session = await ConsultationSession.create({
        appointment_id: appt._id,
        psychiatrist_user_id: appt.psychiatrist_user_id,
        patient_user_id: appt.user_id,
        room_id: `consult-${randomBytes(12).toString('hex')}`,
        scheduled_at: appt.scheduled_at ?? new Date(),
        webrtc_config: this.getSignalingConfig(),
      });
    }

    return {
      id: session._id.toString(),
      appointmentId: appt._id.toString(),
      roomId: session.room_id,
      status: session.status as ConsultationSessionDto['status'],
      scheduledAt: session.scheduled_at.toISOString(),
      psychiatristUserId: session.psychiatrist_user_id.toString(),
      patientUserId: session.patient_user_id.toString(),
    };
  }
}

export const videoCallService = new VideoCallService();
