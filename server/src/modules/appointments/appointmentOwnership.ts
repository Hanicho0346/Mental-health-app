import type { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';

type AppointmentLean = {
  user_id: Types.ObjectId;
  psychiatrist_user_id?: Types.ObjectId | null;
};

export function assertPatientOwnsAppointment(requestUserId: string, doc: AppointmentLean): void {
  if (String(doc.user_id) !== requestUserId) {
    throw new AppError(403, 'Forbidden');
  }
}

export function assertPsychiatristAssigned(requestUserId: string, doc: AppointmentLean): void {
  const assigned = doc.psychiatrist_user_id;
  if (!assigned || String(assigned) !== requestUserId) {
    throw new AppError(403, 'Forbidden');
  }
}

export function assertAdminOrPatientOrAssignedPsychiatrist(
  requestUserId: string,
  role: 'user' | 'psychiatrist' | 'admin',
  doc: AppointmentLean
): void {
  if (role === 'admin') return;
  if (role === 'user') {
    assertPatientOwnsAppointment(requestUserId, doc);
    return;
  }
  assertPsychiatristAssigned(requestUserId, doc);
}
