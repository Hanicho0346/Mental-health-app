import type { Socket } from 'socket.io';
import { hasActivePaidBooking } from '../controllers/booking.service.js';

/**
 * Call this inside socket event handlers to guard chat/call events.
 * Usage:
 *   socket.on('send_message', async (data) => {
 *     if (!await guardPaidBooking(socket, data.receiver_id)) return;
 *     // ... handle message
 *   });
 */
export async function guardPaidBooking(
  socket: Socket & { userId?: string },
  psychiatristId: string
): Promise<boolean> {
  if (!socket.userId) {
    socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
    return false;
  }
  const hasPaid = await hasActivePaidBooking(socket.userId, psychiatristId);
  if (!hasPaid) {
    socket.emit('error', {
      code: 'BOOKING_REQUIRED',
      message: 'Book and pay for a session to use chat.',
    });
    return false;
  }
  return true;
}