"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Appointment_1 = require("./Appointment");
const Message_js_1 = require("./Message.js");
const RefreshSession_js_1 = require("./RefreshSession.js");
const User_js_1 = require("./User.js");
const alert_model_js_1 = require("./alert.model.js");
const video_model_js_1 = require("./video.model.js");
require("./WalletTransaction.js");
const db = {
    Appointment: Appointment_1.Appointment,
    Message: Message_js_1.Message,
    RefreshSession: RefreshSession_js_1.RefreshSession,
    User: User_js_1.User,
    Alert: alert_model_js_1.Alert,
    Video: video_model_js_1.Video,
};
exports.default = db;
