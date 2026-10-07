"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const messageController_js_1 = require("../controllers/messageController.js");
const authenticate_js_1 = require("../middleware/authenticate.js");
const requirePaidConversation_js_1 = require("../middleware/requirePaidConversation.js");
const router = (0, express_1.Router)();
// ── No booking gate — just auth ───────────────────────────────────────────────
router.get('/conversations', authenticate_js_1.requireAuth, messageController_js_1.getConversations);
// ── Booking gate applies to sending/reading individual messages only ──────────
router.use(authenticate_js_1.requireAuth, requirePaidConversation_js_1.requirePaidConversation);
router.get('/', messageController_js_1.listMessages);
router.post('/', messageController_js_1.createMessage);
exports.default = router;
