import { api } from './api';
import { useAuthStore } from '@/stores/authStore';

const getCurrentUserId = async (): Promise<string | null> => {
  return useAuthStore.getState().user?.id ?? null;
};

// Document types
export type DocumentType = 'profile' | 'psychiatrist_doc' | 'wellness_video';

// Fetch full profile - merges /users/me + /psychiatrist/profile
export const fetchPsychiatristFullProfile = async () => {
  const [meRes, profileRes] = await Promise.all([
    api.get('/users/me'),
    api.get('/psychiatrist/profile').catch(() => ({ data: {} })),
  ]);
  const me = meRes.data;
  const v = profileRes.data?.verification ?? {};
  return {
    id: me.id,
    email: me.email,
    full_name: me.full_name,
    role: me.role,
    national_id: me.national_id,
    created_at: me.createdAt,
    verification_status: me.verification_status ?? v.verification_status ?? null,
    is_approved: me.is_approved ?? v.is_approved ?? false,
    admin_feedback: me.admin_feedback ?? v.admin_feedback ?? '',
    is_suspended: v.is_suspended ?? false,
    suspension_reason: v.suspension_reason ?? '',
    specialization: v.specialization ?? null,
    license_number: v.license_number ?? null,
    years_of_experience: v.years_of_experience ?? null,
    hospital_or_clinic: v.hospital_or_clinic ?? me.hospital_or_clinic ?? null,
    phone: v.phone ?? null,
    uploaded_documents: v.uploaded_documents ?? [],
    wallet_balance: v.wallet_balance ?? 0,
    wallet_currency: v.wallet_currency ?? 'ETB',
  };
};

// Fetch verification status - No userId parameter needed
export const fetchPsychiatristVerificationStatus = async () => {
  try {
    const response = await api.get('/psychiatrist/verification/status');
    return response.data;
  } catch (error) {
    console.error('Error fetching verification status:', error);
    throw error;
  }
};

// Upload document
export const uploadPsychiatristDocument = async (document: {
  uri: string;
  type: string;
  name: string;
}, documentType: DocumentType) => {
  try {
    const formData = new FormData();
    formData.append('document', {
      uri: document.uri,
      type: document.type,
      name: document.name,
    } as any);
    formData.append('documentType', documentType);
    
    const response = await api.post('/psychiatrist/upload-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
};

// Fetch wallet info
export const fetchWalletInfo = async () => {
  try {
    const response = await api.get('/psychiatrist/wallet');
    return response.data;
  } catch (error) {
    console.error('Error fetching wallet info:', error);
    throw error;
  }
};

// Fetch wallet transactions
export const fetchWalletTransactions = async (page: number = 1, limit: number = 10) => {
  try {
    const response = await api.get(`/psychiatrist/wallet/transactions?page=${page}&limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    throw error;
  }
};

// If you need to fetch profile for a specific user (e.g., admin viewing)
export const fetchPsychiatristProfileById = async (userId: string) => {
  try {
    const response = await api.get(`/appointments/counselors/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching psychiatrist profile by ID:', error);
    throw error;
  }
};

// Fetch verification status for a specific user
export const fetchPsychiatristVerificationStatusById = async (userId: string) => {
  try {
    const response = await api.get(`/psychiatrist/verification-status/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching verification status by ID:', error);
    throw error;
  }
};