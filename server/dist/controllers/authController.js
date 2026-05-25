"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_js_1 = require("../models/User.js");
const logger_js_1 = require("../utils/logger.js");
const jwt_js_1 = require("../utils/jwt.js");
const SALT_ROUNDS = 12;
const register = async (req, res) => {
    try {
        const { full_name, national_id, email, password } = req.body;
        if (typeof full_name !== 'string' ||
            typeof national_id !== 'string' ||
            typeof email !== 'string' ||
            typeof password !== 'string') {
            res.status(400).json({ error: 'full_name, national_id, email, and password are required' });
            return;
        }
        if (password.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }
        const hashed = await bcryptjs_1.default.hash(password, SALT_ROUNDS);
        const user = await User_js_1.User.create({
            full_name: full_name.trim(),
            national_id: national_id.trim(),
            email: email.trim().toLowerCase(),
            password: hashed,
            avatar_url: '',
            mood_status: '',
        });
        const token = (0, jwt_js_1.signAccessToken)(user._id.toString());
        const doc = user.toObject();
        res.status(201).json({
            token,
            user: {
                id: doc._id.toString(),
                full_name: doc.full_name,
                email: doc.email,
                national_id: doc.national_id,
                avatar_url: doc.avatar_url,
                mood_status: doc.mood_status,
                createdAt: doc.createdAt,
            },
        });
    }
    catch (err) {
        if (isDuplicateKeyError(err)) {
            res.status(409).json({ error: 'Email or national ID already registered' });
            return;
        }
        (0, logger_js_1.logServerError)('register', err, { email: typeof email === 'string' ? email : undefined });
        res.status(500).json({ error: 'Registration failed' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string') {
            res.status(400).json({ error: 'email and password are required' });
            return;
        }
        const user = await User_js_1.User.findOne({ email: email.trim().toLowerCase() }).select('+password');
        if (!user || !(await bcryptjs_1.default.compare(password, user.password))) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        const token = (0, jwt_js_1.signAccessToken)(user._id.toString());
        const doc = user.toObject();
        res.json({
            token,
            user: {
                id: doc._id.toString(),
                full_name: doc.full_name,
                email: doc.email,
                national_id: doc.national_id,
                avatar_url: doc.avatar_url,
                mood_status: doc.mood_status,
                createdAt: doc.createdAt,
            },
        });
    }
    catch (err) {
        (0, logger_js_1.logServerError)('login', err, { email: typeof email === 'string' ? email : undefined });
        res.status(500).json({ error: 'Login failed' });
    }
};
exports.login = login;
function isDuplicateKeyError(err) {
    return typeof err === 'object' && err !== null && err.code === 11000;
}
