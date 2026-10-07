import crypto from 'crypto';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import { User } from '../models/User.js';
import { AiChatMessage } from '../models/AiChatMessage.js';
import { SYSTEM_PROMPT } from '../utils/aiSystemPrompt.js';
import { logServerError } from '../utils/logger.js';

const AI_TIMEZONE = 'Africa/Addis_Ababa';

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: AI_TIMEZONE });
}

async function ensureAiUsageDay(userId: string): Promise<void> {
  const today = todayKey();
  await User.updateOne(
    { _id: userId, ai_chat_usage_date: { $ne: today } },
    { $set: { ai_chats_used_today: 0, ai_chat_usage_date: today } },
  );
}

async function reserveAiChatSlot(
  userId: string,
  dailyLimit: number,
): Promise<{ usedToday: number } | null> {
  await ensureAiUsageDay(userId);

  const reserved = await User.findOneAndUpdate(
    {
      _id: userId,
      ai_chats_used_today: { $lt: dailyLimit },
    },
    { $inc: { ai_chats_used_today: 1 } },
    { new: true },
  )
    .select('ai_chats_used_today')
    .lean();

  if (!reserved) return null;
  return { usedToday: reserved.ai_chats_used_today ?? 0 };
}

export const sendMessage: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { message, history = [] } = req.body;

    if (!message?.trim()) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const user = await User.findById(req.userId)
      .select('ai_chats_used_today ai_chats_daily_limit ai_chat_usage_date')
      .lean();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const dailyLimit = user.ai_chats_daily_limit ?? 5;
    const today = todayKey();
    const usedToday =
      user.ai_chat_usage_date === today ? (user.ai_chats_used_today ?? 0) : 0;

    if (usedToday >= dailyLimit) {
      res.status(429).json({
        error: 'Daily AI limit reached',
        limit_reached: true,
      });
      return;
    }

    const geminiHistory = history.map((m: { role?: string; content?: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    geminiHistory.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      logServerError('aiChat.gemini', { error: 'GEMINI_API_KEY is missing in server/.env' });
      res.status(503).json({ error: 'AI service is not configured (missing API key).' });
      return;
    }

    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
    ].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

    let aiResponse: string | undefined;

    for (const model of candidateModels) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }],
              },
              contents: geminiHistory,
            }),
          }
        );

        if (!geminiRes.ok) {
          const errBody = await geminiRes.text();
          logServerError('aiChat.gemini', { model, status: geminiRes.status, errorMessage: errBody });
          continue; // Try next fallback model if 503 (high demand) or 429/404
        }

        const geminiData = await geminiRes.json();
        aiResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiResponse) {
          break;
        }
      } catch (fetchErr) {
        logServerError('aiChat.gemini.fetchError', { model, error: String(fetchErr) });
      }
    }

    if (!aiResponse) {
      res.status(503).json({
        error: 'Dr. Selam is resting right now. Please try again in a few minutes. 🌙',
        retry_after: 30,
      });
      return;
    }

    const slot = await reserveAiChatSlot(req.userId, dailyLimit);
    if (!slot) {
      res.status(429).json({
        error: 'Daily AI limit reached',
        limit_reached: true,
      });
      return;
    }

    await AiChatMessage.insertMany([
      {
        user_id: new mongoose.Types.ObjectId(req.userId),
        role: 'user',
        content: message.trim(),
      },
      {
        user_id: new mongoose.Types.ObjectId(req.userId),
        role: 'assistant',
        content: aiResponse,
      },
    ]);

    res.json({
      response: aiResponse,
      usage: {
        chats_used_today: slot.usedToday,
        daily_limit: dailyLimit,
      },
    });
  } catch (err) {
    logServerError('aiChat.sendMessage', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getHistory: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const messages = await AiChatMessage.find({
      user_id: new mongoose.Types.ObjectId(req.userId),
    })
      .sort({ created_at: 1 })
      .limit(60)
      .lean();

    res.json(messages);
  } catch (err) {
    logServerError('aiChat.getHistory', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const clearHistory: RequestHandler = async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await AiChatMessage.deleteMany({
      user_id: new mongoose.Types.ObjectId(req.userId),
    });

    res.json({ message: 'History cleared' });
  } catch (err) {
    logServerError('aiChat.clearHistory', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** Exported for tests */
export { todayKey, ensureAiUsageDay, reserveAiChatSlot, AI_TIMEZONE };
