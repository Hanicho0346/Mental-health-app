"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistMessage = persistMessage;
const mongoose_1 = __importDefault(require("mongoose"));
const Message_js_1 = require("../models/Message.js");
const User_js_1 = require("../models/User.js");
async function persistMessage(senderIdStr, receiverIdStr, content) {
    if (!mongoose_1.default.Types.ObjectId.isValid(receiverIdStr)) {
        return { ok: false, status: 400, error: 'Invalid receiver_id' };
    }
    if (receiverIdStr === senderIdStr) {
        return { ok: false, status: 400, error: 'Cannot message yourself' };
    }
    const trimmed = content.trim();
    if (!trimmed) {
        return { ok: false, status: 400, error: 'content cannot be empty' };
    }
    const receiverExists = await User_js_1.User.exists({ _id: receiverIdStr });
    if (!receiverExists) {
        return { ok: false, status: 404, error: 'Receiver not found' };
    }
    const doc = await Message_js_1.Message.create({
        sender_id: new mongoose_1.default.Types.ObjectId(senderIdStr),
        receiver_id: new mongoose_1.default.Types.ObjectId(receiverIdStr),
        content: trimmed,
        is_read: false,
    });
    return {
        ok: true,
        message: {
            id: doc._id.toString(),
            sender_id: doc.sender_id.toString(),
            receiver_id: doc.receiver_id.toString(),
            content: doc.content,
            created_at: doc.created_at,
        },
    };
}
