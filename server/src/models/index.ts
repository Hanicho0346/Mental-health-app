import { Appointment } from './Appointment';
import { Message } from './Message.js';
import { RefreshSession } from './RefreshSession.js';
import { User } from './User.js';
import { Alert } from './alert.model.js';
import { Video } from './video.model.js';
import './WalletTransaction.js';

const db = {
  Appointment,
  Message,
  RefreshSession,
  User,
  Alert,
  Video,
};

export default db;