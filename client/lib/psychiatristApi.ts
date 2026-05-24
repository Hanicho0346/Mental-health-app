import {api} from './api';
import * as SecureStore from 'expo-secure-store';

// Get current user ID - you might need to adjust this based on your auth setup
const getCurrentUserId = async (): Promise<string | null> => {
  try {
    // Option 1: If using Clerk
    // const { userId } = useAuth();
    // return userId;
    
    // Option 2: If using your auth store with AsyncStorage
    const userStr = await SecureStore.getItemAsync('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id || user._id;
    }
    
    // Option 3: Get from your auth store's state
    // You might need to import your store here
    return null;
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
};

// Document types
export type DocumentType = 'profile' | 'psychiatrist_doc' | 'wellness_video';

// Fetch full profile - No userId parameter needed for current user
export const fetchPsychiatristFullProfile = async () => {
  try {
    const response = await api.get('/appointments/counselors');
    return response.data;
  } catch (error) {
    console.error('Error fetching psychiatrist profile:', error);
    throw error;
  }
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