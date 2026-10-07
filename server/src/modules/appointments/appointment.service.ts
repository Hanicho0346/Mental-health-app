import mongoose from "mongoose";
import { Appointment } from "../../models/Appointment.js";
import { User } from "../../models/User.js";
import type { UserRole } from "../../types/roles.js";
import { AppError } from "../../utils/AppError.js";
import { redisService } from "../../integrations/redis/redis.service.js";
import { notifyAppointmentCreated } from "../../services/appointment-notifications.service.js";

/**
 * DTO
 */
export type CounselorPublicDto = {
  id: string;
  full_name: string;
  full_name_am: string;
  specialty: string;
  specialty_am: string;
  avatar_url: string;
  rating: number;
  reviews: number;
};

const COUNSELORS_CACHE_KEY = 'cache:counselors';
const COUNSELORS_CACHE_TTL = 60;

/**
 * ⚡ SINGLE SOURCE OF TRUTH (DB ONLY)
 */
export async function listPublicCounselors(): Promise<CounselorPublicDto[]> {
  const cached = await redisService.getJson<CounselorPublicDto[]>(COUNSELORS_CACHE_KEY);
  if (cached) return cached;

  const counselors = await User.find({
    role: "psychiatrist",
    verification_status: "approved",
  })
    .select("full_name avatar_url specialization")
    .lean()
    .limit(50)
    .exec();

  const result = (counselors as any[]).map((u) => ({
    id: u._id.toString(),
    full_name: u.full_name,
    full_name_am: "",
    specialty: u.specialization?.trim() || "Licensed psychiatrist",
    specialty_am: "",
    avatar_url:
      u.avatar_url?.trim() ||
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=150&h=150&fit=crop",
    rating: 0,
    reviews: 0,
  }));

  await redisService.setJsonWithTTL(COUNSELORS_CACHE_KEY, result, COUNSELORS_CACHE_TTL);
  return result;
}

/**
 * ⚡ RESOLVE COUNSELOR (DB ONLY)
 */
export async function resolveCounselorForBooking(counselor_id: string): Promise<{
  counselor_id: string;
  counselor_name: string;
  psychiatrist_user_id: mongoose.Types.ObjectId;
}> {
  const trimmed = counselor_id.trim();

  if (!mongoose.Types.ObjectId.isValid(trimmed)) {
    throw new AppError(400, "Invalid counselor_id");
  }

  const user = await User.findOne({
    _id: trimmed,
    role: "psychiatrist",
    verification_status: "approved",
  })
    .select("_id full_name")
    .lean()
    .exec();

  if (!user) {
    throw new AppError(404, "Counselor not found");
  }

  return {
    counselor_id: user._id.toString(),
    counselor_name: user.full_name,
    psychiatrist_user_id: user._id,
  };
}

/**
 * APPOINTMENT DTO
 */
export type AppointmentListItem = {
  id: string;
  counselor_id: string;
  counselor_name: string;
  scheduled_at: Date;
  time_label: string;
  createdAt?: Date;
};

function mapAppointment(a: any): AppointmentListItem {
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
export async function listAppointmentsForActor(
  userId: string,
  role: UserRole
): Promise<AppointmentListItem[]> {
  const query =
    role === "admin"
      ? {}
      : role === "psychiatrist"
      ? { psychiatrist_user_id: new mongoose.Types.ObjectId(userId) }
      : { user_id: userId };

  const list = await Appointment.find(query)
    .sort({ scheduled_at: 1 })
    .lean()
    .exec();

  return list.map(mapAppointment);
}

/**
 * ⚡ CREATE APPOINTMENT (SAFE)
 */
export async function createPatientAppointment(
  patientUserId: string,
  input: { counselor_id: string; scheduled_at: string; time_label: string }
): Promise<AppointmentListItem> {
  const resolved = await resolveCounselorForBooking(input.counselor_id);

  const scheduledAt = new Date(input.scheduled_at);

  if (isNaN(scheduledAt.getTime())) {
    throw new AppError(400, "Invalid scheduled_at date");
  }

  const doc = await Appointment.create({
    user_id: new mongoose.Types.ObjectId(patientUserId),
    psychiatrist_user_id: resolved.psychiatrist_user_id,
    counselor_id: resolved.counselor_id,
    counselor_name: resolved.counselor_name,
    scheduled_at: scheduledAt,
    time_label: input.time_label.trim(),
  });

  const patient = await User.findById(patientUserId).select('email full_name').lean();
  if (patient?.email) {
    void notifyAppointmentCreated({
      appointmentId: doc._id.toString(),
      userId: patientUserId,
      email: patient.email,
      fullName: patient.full_name,
      counselorName: resolved.counselor_name,
      scheduledAt,
      timeLabel: input.time_label.trim(),
    }).catch(() => undefined);
  }

  return mapAppointment(doc);
}