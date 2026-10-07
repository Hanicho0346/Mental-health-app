"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Appointment_1 = require("./Appointment");
const ChatMessage_js_1 = require("./ChatMessage.js");
const Conversation_js_1 = require("./Conversation.js");
const RefreshSession_js_1 = require("./RefreshSession.js");
const User_js_1 = require("./User.js");
const alert_model_js_1 = require("./alert.model.js");
const video_model_js_1 = require("./video.model.js");
const Subscription_js_1 = require("./Subscription.js");
require("./WalletTransaction.js");
const db = {
    Appointment: Appointment_1.Appointment,
    RefreshSession: RefreshSession_js_1.RefreshSession,
    User: User_js_1.User,
    Alert: alert_model_js_1.Alert,
    ChatMessage: ChatMessage_js_1.ChatMessage,
    Conversation: Conversation_js_1.Conversation,
    Video: video_model_js_1.Video,
    Subscription: Subscription_js_1.Subscription,
};
exports.default = db;
