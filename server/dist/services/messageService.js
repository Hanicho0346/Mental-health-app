"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistMessage = persistMessage;
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../models/User.js");
const ChatMessage_js_1 = require("../models/ChatMessage.js");
const Conversation_js_1 = require("../models/Conversation.js");
async function persistMessage(senderIdStr, receiverIdStr, content) {
    if (!mongoose_1.default.Types.ObjectId.isValid(receiverIdStr)) {
        return {
            ok: false,
            status: 400,
            error: 'Invalid receiver_id',
        };
    }
    if (receiverIdStr === senderIdStr) {
        return {
            ok: false,
            status: 400,
            error: 'Cannot message yourself',
        };
    }
    const trimmed = content.trim();
    if (!trimmed) {
        return {
            ok: false,
            status: 400,
            error: 'content cannot be empty',
        };
    }
    const receiverExists = await User_js_1.User.exists({
        _id: receiverIdStr,
    });
    if (!receiverExists) {
        return {
            ok: false,
            status: 404,
            error: 'Receiver not found',
        };
    }
    // Conversation gate: must have active paid session
    const conversation = await Conversation_js_1.Conversation.findOne({
        participants: {
            $all: [
                new mongoose_1.default.Types.ObjectId(senderIdStr),
                new mongoose_1.default.Types.ObjectId(receiverIdStr),
            ],
        },
        status: 'active',
    });
    if (!conversation) {
        return {
            ok: false,
            status: 403,
            error: 'No active paid session. Book and pay to unlock chat.',
        };
    }
    const doc = await ChatMessage_js_1.ChatMessage.create({
        conversation_id: conversation._id,
        from: new mongoose_1.default.Types.ObjectId(senderIdStr),
        to: new mongoose_1.default.Types.ObjectId(receiverIdStr),
        content: trimmed,
        type: 'text',
        is_read: false,
    });
    return {
        ok: true,
        message: {
            id: doc._id.toString(),
            sender_id: doc.from.toString(),
            receiver_id: doc.to.toString(),
            content: doc.content,
            created_at: doc.timestamp,
        },
        conversationId: conversation._id.toString(),
    };
}
