/** Future react-native-webrtc session metadata (not implemented yet). */
export type ConsultationSessionStatus =
  | 'scheduled'
  | 'ready'
  | 'active'
  | 'ended'
  | 'cancelled';

export type ConsultationSessionDto = {
  id: string;
  appointmentId: string;
  roomId: string;
  status: ConsultationSessionStatus;
  scheduledAt: string;
  psychiatristUserId: string;
  patientUserId: string;
};

export type WebRtcSignalingConfig = {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  /** Populated when TURN/STUN env vars are configured. */
  enabled: boolean;
};
