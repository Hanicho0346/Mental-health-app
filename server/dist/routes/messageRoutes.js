"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const messageController_js_1 = require("../controllers/messageController.js");
const authenticate_js_1 = require("../middleware/authenticate.js");
const router = (0, express_1.Router)();
router.use(authenticate_js_1.requireAuth);
router.get('/', messageController_js_1.listMessages);
router.post('/', messageController_js_1.createMessage);
router.get('/conversations', messageController_js_1.getConversations); // Add this line
exports.default = router;
