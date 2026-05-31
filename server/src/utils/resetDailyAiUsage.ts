// utils/resetDailyUsage.ts
import { User } from '../models/User.js';

export async function resetDailyAiUsage() {
  await User.updateMany(
    { ai_chats_used_today: { $gt: 0 } },
    { $set: { ai_chats_used_today: 0 } }
  );
}