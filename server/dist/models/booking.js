"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Booking = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const BookingSchema = new mongoose_1.Schema({
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    psychiatrist_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, default: 300 },
    platform_fee: { type: Number, required: true, default: 90 }, // 30%
    psychiatrist_share: { type: Number, required: true, default: 210 }, // 70%
    payment_status: {
        type: String,
        enum: ['pending_payment', 'paid', 'failed', 'refunded'],
        default: 'pending_payment',
    },
    booking_status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending',
    },
    chapa_tx_ref: { type: String, required: true, unique: true },
    chapa_checkout_url: { type: String },
    scheduled_at: { type: Date },
    time_label: { type: String },
    already_processed: { type: Boolean, default: false },
}, { timestamps: true });
BookingSchema.index({ user_id: 1 });
BookingSchema.index({ psychiatrist_id: 1 });
BookingSchema.index({ payment_status: 1 });
BookingSchema.index({ user_id: 1, psychiatrist_id: 1, payment_status: 1 });
exports.Booking = mongoose_1.default.model('Booking', BookingSchema);
