import { api } from './api';

export interface BookingInitResult {
  booking_id: string;
  checkout_url: string;
  tx_ref: string;
}

export interface PaidPsychiatrist {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string;
  specialization: string;
  is_online: boolean;
}

export async function initiateBookingApi(params: {
  psychiatrist_id: string;
  scheduled_at?: string;
  time_label?: string;
}): Promise<BookingInitResult> {
  const { data } = await api.post<BookingInitResult>('/bookings/initiate', params);
  return data;
}

export async function verifyPaymentApi(tx_ref: string): Promise<{
  success: boolean;
  already_paid: boolean;
}> {
  const { data } = await api.get(`/bookings/verify/${tx_ref}`);
  return data;
}

export async function getMyPsychiatristsApi(): Promise<PaidPsychiatrist[]> {
  const { data } = await api.get<{ psychiatrists: PaidPsychiatrist[] }>('/bookings/my-psychiatrists');
  return data.psychiatrists;
}

export async function checkBookingAccessApi(psychiatristId: string): Promise<boolean> {
  const { data } = await api.get<{ has_access: boolean }>(`/bookings/check/${psychiatristId}`);
  return data.has_access;
}