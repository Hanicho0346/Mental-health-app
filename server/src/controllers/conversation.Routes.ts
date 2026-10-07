import express from "express";

import {
  getMyConversations,
  getConversationMessages,
} from "../controllers/conversationController.js";

import { requireAuth } from "../middleware/authenticate.js";

const router = express.Router();

router.get(
  "/my-conversations",
  requireAuth,
  getMyConversations
);

router.get(
  "/:conversationId/messages",
  requireAuth,
  getConversationMessages
);

export default router;