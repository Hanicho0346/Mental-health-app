"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardPaidBooking = guardPaidBooking;
const booking_service_js_1 = require("../controllers/booking.service.js");
/**
 * Call this inside socket event handlers to guard chat/call events.
 * Usage:
 *   socket.on('send_message', async (data) => {
 *     if (!await guardPaidBooking(socket, data.receiver_id)) return;
 *     // ... handle message
 *   });
 */
async function guardPaidBooking(socket, psychiatristId) {
    if (!socket.userId) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
        return false;
    }
    const hasPaid = await (0, booking_service_js_1.hasActivePaidBooking)(socket.userId, psychiatristId);
    if (!hasPaid) {
        socket.emit('error', {
            code: 'BOOKING_REQUIRED',
            message: 'Book and pay for a session to use chat.',
        });
        return false;
    }
    return true;
}
