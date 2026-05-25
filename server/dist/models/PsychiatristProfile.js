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
exports.PsychiatristProfile = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const roles_js_1 = require("../types/roles.js");
const psychiatristDocSchema = new mongoose_1.Schema({
    url: { type: String, required: true },
    public_id: { type: String, default: '' },
    document_type: {
        type: String,
        enum: ['license', 'national_id', 'certificate', 'other'],
        default: 'other',
    },
    uploaded_at: { type: Date, default: Date.now },
}, { _id: false });
const psychiatristProfileSchema = new mongoose_1.Schema({
    user_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    specialization: { type: String, trim: true, default: '' },
    license_number: { type: String, trim: true, default: '' },
    years_of_experience: { type: Number, min: 0, max: 80 },
    hospital_or_clinic: { type: String, trim: true, default: '' },
    uploaded_documents: { type: [psychiatristDocSchema], default: [] },
    approval_status: {
        type: String,
        enum: roles_js_1.VERIFICATION_STATUSES,
        default: 'pending',
        index: true,
    },
    admin_feedback: { type: String, trim: true, default: '' },
    reviewed_by: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
}, { timestamps: true });
exports.PsychiatristProfile = mongoose_1.default.model('PsychiatristProfile', psychiatristProfileSchema);
