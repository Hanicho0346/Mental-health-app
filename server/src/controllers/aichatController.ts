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

    if (!process.env.GEMINI_API_KEY) {
      logServerError('aiChat.gemini.noKey', {
        hint: 'GEMINI_API_KEY is not set in the server environment',
      });
      res.status(503).json({ error: 'AI not configured' });
      return;
    }

    const geminiHistory = history.map((m: any) => ({
      author: m.role === 'assistant' ? 'assistant' : 'user',
      content: [
        {
          type: 'text',
          text: m.content,
        },
      ],
    }));

    geminiHistory.push({
      author: 'user',
      content: [
        {
          type: 'text',
          text: message.trim(),
        },
      ],
    });

    function extractGeminiText(data: any): string | null {
      if (!data || typeof data !== 'object') return null;
      if (Array.isArray(data.candidates)) {
        for (const candidate of data.candidates) {
          if (Array.isArray(candidate.content)) {
            for (const chunk of candidate.content) {
              if (typeof chunk?.text === 'string') return chunk.text;
              if (typeof chunk?.output_text === 'string') return chunk.output_text;
            }
          }
          if (typeof candidate.output === 'string') return candidate.output;
          if (typeof candidate.output_text === 'string') return candidate.output_text;
        }
      }
      if (Array.isArray(data.output)) {
        for (const item of data.output) {
          if (Array.isArray(item.content)) {
            for (const chunk of item.content) {
              if (typeof chunk?.text === 'string') return chunk.text;
              if (typeof chunk?.output_text === 'string') return chunk.output_text;
            }
          }
        }
      }
      if (typeof data.output === 'string') return data.output;
      return null;
    }

    async function callGemini(endpoint: string, body: unknown): Promise<{ status: number; ok: boolean; data: any; rawText: string }> {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, ok: res.ok, data: parsed, rawText: text };
    }

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    const apiKey = encodeURIComponent(process.env.GEMINI_API_KEY ?? '');

    const primaryEndpoint = `${baseUrl}/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const primaryBody = {
      prompt: {
        context: SYSTEM_PROMPT,
        messages: geminiHistory,
      },
      temperature: 0.7,
      maxOutputTokens: 512,
      candidateCount: 1,
    };

    const fallbackEndpoint = `${baseUrl}2/models/gemini-3.5-flash:generateText?key=${apiKey}`;
    const textPrompt = [
      SYSTEM_PROMPT,
      ...history.map((m: any) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`),
      `User: ${message.trim()}`,
    ].join('\n\n');
    const fallbackBody = {
      prompt: { text: textPrompt },
      temperature: 0.7,
      maxOutputTokens: 512,
      candidateCount: 1,
    };

    const firstResult = await callGemini(primaryEndpoint, primaryBody);
    let aiResponse: string | null = null;
    let geminiData = firstResult.data;

    if (firstResult.ok) {
      aiResponse = extractGeminiText(geminiData);
    }

    if (!aiResponse) {
      const fallbackResult = await callGemini(fallbackEndpoint, fallbackBody);
      geminiData = fallbackResult.data;
      if (fallbackResult.ok) {
        aiResponse = extractGeminiText(geminiData);
      }
      if (!aiResponse) {
        logServerError('aiChat.gemini', {
          primary: {
            endpoint: primaryEndpoint,
            status: firstResult.status,
            response: firstResult.data,
            rawText: firstResult.rawText,
          },
          fallback: {
            endpoint: fallbackEndpoint,
            status: fallbackResult.status,
            response: fallbackResult.data,
            rawText: fallbackResult.rawText,
          },
        });
      }
    }

    if (!aiResponse) {
      const status = firstResult.status || 502;
      if (firstResult.status === 429 || (firstResult.ok && geminiData?.error?.code === 429)) {
        res.status(503).json({
          error: 'Dr. Selam is resting right now. Please try again in a few minutes. 🌙',
          retry_after: 60,
        });
        return;
      }
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
