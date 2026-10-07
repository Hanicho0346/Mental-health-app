import axios from 'axios';
import { AppError } from '../utils/AppError.js';

const CHAPA_BASE = 'https://api.chapa.co/v1';
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY ?? '';

function useDevPaymentMock(): boolean {
  return !CHAPA_SECRET && process.env.NODE_ENV !== 'production';
}

interface ChapaInitResponse {
  status: string;
  message: string;
  data: { checkout_url: string };
}

interface ChapaVerifyResponse {
  status: string;
  message: string;
  data: {
    status: string; // 'success' | 'failed' | 'pending'
    tx_ref: string;
    amount: number;
    currency: string;
  };
}

function extractChapaMessage(err: any): string {
  const data = err?.response?.data;
  if (!data) return err?.message ?? 'Chapa service error';
  // Chapa sometimes returns { message: string } or { message: { field: string } }
  const msg = data.message;
  if (typeof msg === 'string' && msg.length > 0) return msg;
  if (msg && typeof msg === 'object') {
    // flatten first string value found
    const first = Object.values(msg).find((v) => typeof v === 'string');
    if (first) return first as string;
    return JSON.stringify(msg);
  }
  if (typeof data.error === 'string') return data.error;
  return err?.message ?? 'Chapa service error';
}

export async function initiateChapaPayment(params: {
  tx_ref: string;
  amount: number;
  email: string;
  first_name: string;
  last_name: string;
  callback_url: string;
  return_url: string;
  description: string;
}): Promise<{ checkout_url: string }> {
  if (useDevPaymentMock()) {
    // Build return URL manually to support both http:// and deep-link schemes
    // (e.g. mental-health-mobile://) — node's URL constructor only accepts http/https
    const base = params.return_url;
    const sep = base.includes('?') ? '&' : '?';
    const mockUrl = `${base}${sep}tx_ref=${encodeURIComponent(params.tx_ref)}&trx_ref=${encodeURIComponent(params.tx_ref)}&status=success`;
    console.warn(
      '[Chapa] DEV mock checkout (CHAPA_SECRET_KEY unset). Set a real key for live payments.',
    );
    return { checkout_url: mockUrl };
  }

  if (!CHAPA_SECRET) {
    throw new AppError(
      503,
      'Payment service not configured. Set CHAPA_SECRET_KEY in the server environment.',
    );
  }

  try {
    const { data } = await axios.post<ChapaInitResponse>(
      `${CHAPA_BASE}/transaction/initialize`,
      {
        ...params,
        currency: 'ETB',
        customization: {
          title: 'SelamMind',
          description: params.description,
        },
      },
      { headers: { Authorization: `Bearer ${CHAPA_SECRET}` } },
    );

    if (data.status !== 'success') {
      throw new AppError(400, data.message ?? 'Payment initialization failed');
    }
    return { checkout_url: data.data.checkout_url };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Chapa] initiate error:', JSON.stringify(err?.response?.data ?? err?.message));
    }
    throw new AppError(502, extractChapaMessage(err));
  }
}

export async function verifyChapaPayment(tx_ref: string): Promise<{
  success: boolean;
  status: string;
  amount: number;
}> {
  if (useDevPaymentMock()) {
    console.warn('[Chapa] DEV mock verify for', tx_ref);
    return { success: true, status: 'success', amount: 0 };
  }

  if (!CHAPA_SECRET) {
    throw new AppError(
      503,
      'Payment service not configured. Set CHAPA_SECRET_KEY in the server environment.',
    );
  }

  try {
    const { data } = await axios.get<ChapaVerifyResponse>(
      `${CHAPA_BASE}/transaction/verify/${tx_ref}`,
      { headers: { Authorization: `Bearer ${CHAPA_SECRET}` } },
    );
    return {
      success: data.data.status === 'success',
      status: data.data.status,
      amount: data.data.amount,
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, extractChapaMessage(err));
  }
}
