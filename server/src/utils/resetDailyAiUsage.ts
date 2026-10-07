// utils/resetDailyUsage.ts
import { User } from '../models/User.js';

export async function resetDailyAiUsage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Addis_Ababa' });
  await User.updateMany(
    { ai_chat_usage_date: { $ne: today } },
    { $set: { ai_chats_used_today: 0, ai_chat_usage_date: today } },
  );
}