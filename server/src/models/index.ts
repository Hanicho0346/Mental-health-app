import { Appointment } from './Appointment';
import { ChatMessage } from './ChatMessage.js';
import { Conversation } from './Conversation.js';
import { RefreshSession } from './RefreshSession.js';
import { User } from './User.js';
import { Alert } from './alert.model.js';
import { Video } from './video.model.js';
import { Subscription } from './Subscription.js';
import { GroupChat, GroupMessage } from './GroupChat.js';
import { CallLog } from './CallLog.js';
import './WalletTransaction.js';

const db = {
  Appointment,
  RefreshSession,
  User,
  Alert,
  ChatMessage,
  Conversation,
  Video,
  Subscription,
  GroupChat,
  GroupMessage,
  CallLog,
};

export default db;