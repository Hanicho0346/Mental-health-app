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
exports.WalletTransaction = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const WalletTransactionSchema = new mongoose_1.Schema({
    user_id: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    booking_id: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Booking',
        required: false,
    },
    amount: {
        type: Number,
        required: true,
    },
    transaction_type: {
        type: String,
        enum: ['session_earning', 'platform_commission', 'payment_received', 'withdrawal', 'refund'],
        required: true,
    },
    payment_reference: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed',
    },
    description: {
        type: String,
        default: '',
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});
// Indexes per spec
WalletTransactionSchema.index({ payment_reference: 1 });
WalletTransactionSchema.index({ booking_id: 1 });
WalletTransactionSchema.index({ transaction_type: 1 });
WalletTransactionSchema.index({ user_id: 1, created_at: -1 });
WalletTransactionSchema.index({ status: 1 });
exports.WalletTransaction = mongoose_1.default.model('WalletTransaction', WalletTransactionSchema);
