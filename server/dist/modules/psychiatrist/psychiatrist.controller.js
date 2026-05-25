"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPsychiatristStats = exports.getPsychiatristTransactions = exports.getPsychiatristWallet = exports.uploadDocument = exports.submitVerification = exports.getFullProfile = exports.getVerificationStatus = void 0;
const booking_js_1 = require("../../models/booking.js");
const WalletTransaction_js_1 = require("../../models/WalletTransaction.js");
const psychiatrist_service_js_1 = require("./psychiatrist.service.js");
const AppError_js_1 = require("../../utils/AppError.js");
const User_js_1 = require("../../models/User.js");
const getVerificationStatus = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const status = await (0, psychiatrist_service_js_1.getPsychiatristVerificationStatus)(req.userId);
        res.json(status);
    }
    catch (err) {
        next(err);
    }
};
exports.getVerificationStatus = getVerificationStatus;
/**
 * GET /api/psychiatrist/profile
 * Returns the psychiatrist's full profile including user data and verification status.
 * This matches your route: router.get('/profile', getFullProfile)
 */
const getFullProfile = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // Get user data
        const user = await User_js_1.User.findOne({ clerk_id: req.userId })
            .select('-password')
            .lean();
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // Get verification status (includes profile details)
        const verificationStatus = await (0, psychiatrist_service_js_1.getPsychiatristVerificationStatus)(req.userId);
        // Combine and return full profile
        res.json({
            id: user._id,
            clerk_id: user.clerk_id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            is_active: user.is_active,
            created_at: user.created_at,
            updated_at: user.updated_at,
            verification: verificationStatus,
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getFullProfile = getFullProfile;
/**
 * POST /api/psychiatrist/verification/submit
 * Submits the psychiatrist verification profile.
 * Validated with psychiatristProfileUpdateSchema
 */
const submitVerification = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const status = await (0, psychiatrist_service_js_1.submitPsychiatristProfile)(req.userId, req.body);
        res.json(status);
    }
    catch (err) {
        next(err);
    }
};
exports.submitVerification = submitVerification;
/**
 * POST /api/psychiatrist/verification/documents
 * Uploads a document for psychiatrist verification.
 * Uses memoryUpload middleware and validated with psychiatristVerificationSchema
 */
const uploadDocument = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const file = req.file;
        if (!file) {
            throw new AppError_js_1.AppError(400, 'Document file is required');
        }
        // Get document type from validated body
        const documentType = (req.body.document_type ?? 'other');
        const doc = await (0, psychiatrist_service_js_1.uploadPsychiatristDocument)(req.userId, file, documentType);
        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            document: doc
        });
    }
    catch (err) {
        next(err);
    }
};
exports.uploadDocument = uploadDocument;
/**
 * GET /api/psychiatrist/wallet
 * Returns the psychiatrist's current wallet balance.
 */
const getPsychiatristWallet = async (req, res) => {
    try {
        const clerkId = req.userId;
        if (!clerkId) {
            res.status(401).json({
                error: 'Unauthorized',
            });
            return;
        }
        const user = await User_js_1.User.findOne({
            clerk_id: clerkId,
        });
        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }
        const psychiatristId = user._id;
        // Calculate balance from completed transactions
        const result = await WalletTransaction_js_1.WalletTransaction.aggregate([
            {
                $match: {
                    user_id: psychiatristId,
                    status: 'completed',
                    transaction_type: {
                        $in: ['session_earning', 'withdrawal', 'refund'],
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    credits: {
                        $sum: {
                            $cond: [
                                { $in: ['$transaction_type', ['session_earning', 'refund']] },
                                '$amount',
                                0,
                            ],
                        },
                    },
                    debits: {
                        $sum: {
                            $cond: [
                                { $eq: ['$transaction_type', 'withdrawal'] },
                                '$amount',
                                0,
                            ],
                        },
                    },
                },
            },
        ]);
        const balance = result.length > 0
            ? result[0].credits - result[0].debits
            : 0;
        res.json({
            success: true,
            balance,
            currency: 'ETB',
        });
    }
    catch (err) {
        console.error('Error in getPsychiatristWallet:', err);
        res.status(500).json({
            error: 'Failed to fetch wallet balance',
        });
    }
};
exports.getPsychiatristWallet = getPsychiatristWallet;
/**
 * GET /api/psychiatrist/wallet/transactions
 * Returns paginated transaction history for the psychiatrist.
 */
const getPsychiatristTransactions = async (req, res) => {
    try {
        const clerkId = req.userId;
        if (!clerkId) {
            res.status(401).json({
                error: 'Unauthorized',
            });
            return;
        }
        const user = await User_js_1.User.findOne({
            clerk_id: clerkId,
        });
        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }
        const psychiatristId = user._id;
        // Pagination parameters
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        // Get transactions with pagination
        const [transactions, total] = await Promise.all([
            WalletTransaction_js_1.WalletTransaction.find({
                user_id: psychiatristId,
            })
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            WalletTransaction_js_1.WalletTransaction.countDocuments({
                user_id: psychiatristId,
            }),
        ]);
        // Get summary statistics
        const summary = await WalletTransaction_js_1.WalletTransaction.aggregate([
            {
                $match: {
                    user_id: psychiatristId,
                    status: 'completed',
                },
            },
            {
                $group: {
                    _id: null,
                    total_earned: {
                        $sum: {
                            $cond: [
                                { $eq: ['$transaction_type', 'session_earning'] },
                                '$amount',
                                0,
                            ],
                        },
                    },
                    total_withdrawn: {
                        $sum: {
                            $cond: [
                                { $eq: ['$transaction_type', 'withdrawal'] },
                                '$amount',
                                0,
                            ],
                        },
                    },
                },
            },
        ]);
        res.json({
            success: true,
            transactions,
            summary: {
                total_earned: summary[0]?.total_earned || 0,
                total_withdrawn: summary[0]?.total_withdrawn || 0,
                current_balance: (summary[0]?.total_earned || 0) - (summary[0]?.total_withdrawn || 0),
            },
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                has_next: page * limit < total,
                has_prev: page > 1,
            },
        });
    }
    catch (err) {
        console.error('Error in getPsychiatristTransactions:', err);
        res.status(500).json({
            error: 'Failed to fetch transaction history',
        });
    }
};
exports.getPsychiatristTransactions = getPsychiatristTransactions;
/**
 * GET /api/psychiatrist/stats
 * Optional: Returns psychiatrist statistics (total sessions, earnings, etc.)
 */
const getPsychiatristStats = async (req, res) => {
    try {
        const clerkId = req.userId;
        if (!clerkId) {
            res.status(401).json({
                error: 'Unauthorized',
            });
            return;
        }
        const user = await User_js_1.User.findOne({
            clerk_id: clerkId,
        });
        if (!user) {
            res.status(404).json({
                error: 'User not found',
            });
            return;
        }
        const psychiatristId = user._id;
        // Get completed sessions count
        const completedSessions = await booking_js_1.Booking.countDocuments({
            psychiatrist_id: psychiatristId,
            booking_status: 'completed',
        });
        // Get pending sessions
        const pendingSessions = await booking_js_1.Booking.countDocuments({
            psychiatrist_id: psychiatristId,
            booking_status: 'pending',
        });
        // Get total earnings
        const earningsResult = await WalletTransaction_js_1.WalletTransaction.aggregate([
            {
                $match: {
                    user_id: psychiatristId,
                    transaction_type: 'session_earning',
                    status: 'completed',
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' },
                },
            },
        ]);
        const totalEarnings = earningsResult.length > 0 ? earningsResult[0].total : 0;
        // Get pending withdrawals
        const pendingWithdrawals = await WalletTransaction_js_1.WalletTransaction.countDocuments({
            user_id: psychiatristId,
            transaction_type: 'withdrawal',
            status: 'pending',
        });
        res.json({
            success: true,
            stats: {
                total_sessions: completedSessions,
                pending_sessions: pendingSessions,
                total_earnings: totalEarnings,
                pending_withdrawals: pendingWithdrawals,
            },
        });
    }
    catch (err) {
        console.error('Error in getPsychiatristStats:', err);
        res.status(500).json({
            error: 'Failed to fetch statistics',
        });
    }
};
exports.getPsychiatristStats = getPsychiatristStats;
