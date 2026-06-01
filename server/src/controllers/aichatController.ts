import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import { User } from '../models/User.js';
import { AiChatMessage } from '../models/AiChatMessage.js';
import { SYSTEM_PROMPT } from '../utils/aiSystemPrompt.js';
import { logServerError } from '../utils/logger.js';

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
      .select('ai_chats_used_today ai_chats_daily_limit')
      .lean();

    const dailyLimit = (user as any)?.ai_chats_daily_limit ?? null;
    const usedToday  = (user as any)?.ai_chats_used_today  ?? 0;

    if (dailyLimit !== null && usedToday >= dailyLimit) {
      res.status(429).json({
        error: 'Daily AI limit reached',
        limit_reached: true,
      });
      return;
    }

    const geminiHistory = history.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    geminiHistory.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    });

    // gemini-3.5-flash: current free-tier model (1.5-flash blocked for new projects since Apr 2025)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
      logServerError('aiChat.gemini', { errorMessage: errBody });

      if (geminiRes.status === 429) {
        res.status(503).json({
          error:
            'Dr. Selam is resting right now. Please try again in a few minutes. 🌙',
          retry_after: 60,
        });
        return;
      }

      if (geminiRes.status === 404) {
        // Model not found — likely API key doesn't have access to this model
        logServerError('aiChat.gemini.modelNotFound', {
          hint: 'Check your Gemini API key and ensure the model is available for your project',
        });
        res.status(502).json({ error: 'AI model unavailable' });
        return;
      }

      res.status(502).json({ error: 'AI unavailable' });
      return;
    }

    const geminiData = await geminiRes.json();
    const aiResponse =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      res.status(502).json({ error: 'AI unavailable' });
      return;
    }

    // Save messages + increment counter in parallel
    await Promise.all([
      AiChatMessage.insertMany([
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
      ]),
      User.findByIdAndUpdate(req.userId, {
        $inc: { ai_chats_used_today: 1 },
      }),
    ]);

    res.json({
      response: aiResponse,
      usage: {
        chats_used_today: usedToday + 1,
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