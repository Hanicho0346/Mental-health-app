import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import { configureCloudinary } from './cloudinary.service.js';
import { env } from '../config/env.js';
import db from '../models/index.js';

configureCloudinary();

interface SaveVideoData {
  title: string;
  amharicTitle: string;
  tag: string;
  videoUrl: string;
  publicId?: string;
}

type PopulatedPatient = {
  _id: mongoose.Types.ObjectId;
  full_name?: string;
  avatar_url?: string;
};

type LeanAppointmentRow = {
  _id: mongoose.Types.ObjectId;
  user_id: PopulatedPatient | mongoose.Types.ObjectId;
  time_label?: string;
  appointment_type?: string;
  notes?: string;
};

type AlertWithPatient = {
  _id: mongoose.Types.ObjectId;
  patient_id: PopulatedPatient | mongoose.Types.ObjectId;
  message: string;
  priority: string;
  createdAt: Date;
};

export type DashboardStatsDto = {
  appointmentsToday: number;
  patientsCount: number;
  unreadMessagesCount: number;
  urgentAlertsCount: number;
};

export type UrgentAlertItemDto = {
  id: string;
  patientId: string;
  patientName: string;
  status: string;
  time: string;
};

export type DoctorAppointmentItemDto = {
  id: string;
  patientId: string;
  patientName: string;
  avatar: string;
  time: string;
  type: string;
  notes: string | null;
};

export type DoctorPatientListItemDto = {
  id: string;
  full_name: string;
  avatar_url: string;
  mood_status: string;
};

export type DoctorPatientProfileDto = DoctorPatientListItemDto & {
  email: string;
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function psychiatristFilter(doctorId: string) {
  return { psychiatrist_user_id: new mongoose.Types.ObjectId(doctorId) };
}

class DoctorService {
  async getDashboardStats(doctorId: string): Promise<DashboardStatsDto> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const doctorOid = new mongoose.Types.ObjectId(doctorId);

    const [appointmentsToday, patientIds, unreadMessagesCount, urgentAlertsCount] = await Promise.all([
      db.Appointment.countDocuments({
        ...psychiatristFilter(doctorId),
        scheduled_at: {
          $gte: startOfToday,
          $lte: endOfToday,
        },
      }),
      db.Appointment.distinct('user_id', psychiatristFilter(doctorId)),
      db.ChatMessage.countDocuments({
        receiver_id: doctorOid,
        is_read: { $ne: true },
      }),
      db.Alert.countDocuments({
        doctor_id: doctorOid,
        is_resolved: false,
        priority: 'URGENT',
      }),
    ]);

    return {
      appointmentsToday,
      patientsCount: patientIds.length,
      unreadMessagesCount,
      urgentAlertsCount,
    };
  }

  async getUrgentAlerts(doctorId: string): Promise<UrgentAlertItemDto[]> {
    const doctorOid = new mongoose.Types.ObjectId(doctorId);

    const alerts = await db.Alert.find({
      doctor_id: doctorOid,
      is_resolved: false,
      priority: 'URGENT',
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate<{ patient_id: PopulatedPatient }>('patient_id', 'full_name avatar_url')
      .lean()
      .exec();

    return (alerts as AlertWithPatient[]).map((alert) => {
      const populated = alert.patient_id && 'full_name' in alert.patient_id ? alert.patient_id : null;
      const patientOid =
        populated?._id ?? (alert.patient_id instanceof mongoose.Types.ObjectId ? alert.patient_id : null);

      return {
        id: alert._id.toString(),
        patientId: patientOid ? patientOid.toString() : '',
        patientName: populated?.full_name?.trim() || 'Unknown',
        status: alert.message || 'Urgent Alert',
        time: formatTimeAgo(alert.createdAt),
      };
    });
  }

  async getAppointmentsForDate(doctorId: string, targetDate: Date): Promise<DoctorAppointmentItemDto[]> {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = (await db.Appointment.find({
      ...psychiatristFilter(doctorId),
      scheduled_at: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate('user_id', 'full_name avatar_url')
      .lean()
      .exec()) as LeanAppointmentRow[];

    return appointments.map((appt) => {
      const populated = appt.user_id && 'full_name' in appt.user_id ? appt.user_id : null;
      const userOid =
        populated?._id ?? (appt.user_id instanceof mongoose.Types.ObjectId ? appt.user_id : null);

      return {
        id: appt._id.toString(),
        patientId: userOid ? userOid.toString() : '',
        patientName: populated?.full_name?.trim() || 'Unknown',
        avatar: populated?.avatar_url?.trim() || '',
        time: appt.time_label ?? '',
        type: appt.appointment_type?.trim() || 'Video Call',
        notes:
          typeof appt.notes === 'string' && appt.notes.trim() ? appt.notes.trim() : null,
      };
    });
  }

  async listPatientsForPsychiatrist(doctorId: string): Promise<DoctorPatientListItemDto[]> {
    const patientIds = await db.Appointment.distinct('user_id', psychiatristFilter(doctorId));
    if (patientIds.length === 0) {
      return [];
    }

    const users = await db.User.find({ _id: { $in: patientIds } })
      .select('full_name avatar_url mood_status')
      .sort({ full_name: 1 })
      .lean()
      .exec();

    return users.map((u) => ({
      id: u._id.toString(),
      full_name: u.full_name,
      avatar_url: u.avatar_url?.trim() ?? '',
      mood_status: u.mood_status?.trim() ?? '',
    }));
  }

  async getPatientProfileForPsychiatrist(
    doctorId: string,
    patientId: string,
  ): Promise<DoctorPatientProfileDto | null> {
    const hasAppointment = await db.Appointment.exists({
      ...psychiatristFilter(doctorId),
      user_id: new mongoose.Types.ObjectId(patientId),
    });
    if (!hasAppointment) {
      return null;
    }

    const user = await db.User.findById(patientId)
      .select('full_name avatar_url mood_status email')
      .lean()
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: user._id.toString(),
      full_name: user.full_name,
      avatar_url: user.avatar_url?.trim() ?? '',
      mood_status: user.mood_status?.trim() ?? '',
      email: user.email,
    };
  }

 async generateUploadSignature(): Promise<{
    signature: string;
    timestamp: number;
    cloudName: string;
    apiKey: string;
    folder: string;
  }> {
    const folder = 'psychiatry_support_videos';
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, invalidate: false },
      env.cloudinary.apiSecret!
    );
    return {
      signature,
      timestamp,
      cloudName: env.cloudinary.cloudName!,
      apiKey: env.cloudinary.apiKey!,
      folder,
    };
  }

  async saveVideoRecord(
    doctorId: string,
    data: SaveVideoData,
  ): Promise<Record<string, unknown>> {
    const newVideo = await db.Video.create({
      doctor_id: new mongoose.Types.ObjectId(doctorId),
      title: data.title.trim() || 'Untitled',
      amharic_title: data.amharicTitle.trim(),
      category: data.tag.trim(),
      video_url: data.videoUrl,
      public_id: data.publicId,
    });
    return newVideo.toObject();
  }
  async getSupportVideos(): Promise<Record<string, unknown>[]> {
  const videos = await db.Video.find()
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return videos.map((video) => ({
    id: video._id.toString(),
    title: video.title,
    amharic_title: video.amharic_title,
    category: video.category,
    video_url: video.video_url,
    createdAt: video.createdAt,
  }));
}
async incrementListen(videoId: string) {
  return db.Video.findByIdAndUpdate(
    videoId,
    { $inc: { listens: 1 } },
    { new: true }
  );
}

async toggleFavorite(videoId: string, userId: string) {
   const video = await db.Video.findById(videoId);
  if (!video) return null;

  const favs: mongoose.Types.ObjectId[] = video.favorites ?? [];
  const objId = new mongoose.Types.ObjectId(userId);
  const alreadyFav = favs.some((f) => f.equals(objId));

  if (alreadyFav) {
    video.favorites = favs.filter((f) => !f.equals(objId));
  } else {
    video.favorites.push(objId);
  }

  await video.save();
  return { isFavorite: !alreadyFav };
}
}

export default new DoctorService();
