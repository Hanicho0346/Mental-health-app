import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import {
  getConversationMessages,
  getMyConversations,
} from '../src/controllers/conversationController.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

describe('conversationController authorization', () => {
  it('rejects unauthenticated getMyConversations', async () => {
    const req = { userId: undefined } as Request;
    const res = mockRes();
    await getMyConversations(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-participant getConversationMessages', async () => {
    const req = {
      userId: new mongoose.Types.ObjectId().toString(),
      params: { conversationId: new mongoose.Types.ObjectId().toString() },
    } as unknown as Request;
    const res = mockRes();

    const findById = vi.spyOn(
      (await import('../src/models/Conversation.js')).Conversation,
      'findById',
    );
    findById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          participants: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
        }),
    } as never);

    await getConversationMessages(req, res);
    expect(res.statusCode).toBe(403);
    findById.mockRestore();
  });
});
