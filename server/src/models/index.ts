import { Appointment } from './Appointment';
import { ChatMessage } from './ChatMessage.js';
import { Conversation } from './Conversation.js';
import { RefreshSession } from './RefreshSession.js';
import { User } from './User.js';
import { Alert } from './alert.model.js';
import { Video } from './video.model.js';
import { Subscription } from './Subscription.js';
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
};

export default db;