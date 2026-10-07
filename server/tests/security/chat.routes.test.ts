import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signAccessToken } from '../src/utils/jwt.js';

describe('legacy /api/chat security', () => {
  let mongo: MongoMemoryServer;
  let app: express.Express;
  let userAId: string;
  let userBId: string;
  let userCId: string;
  let tokenA: string;
  let tokenC: string;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = `${mongo.getUri()}mentalhealth`;
    process.env.JWT_SECRET = 'test-jwt-secret-min-16';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-16';

    const { connectDb } = await import('../src/database/connection.js');
    await connectDb();

    const { User } = await import('../src/models/User.js');
    const { Conversation } = await import('../src/models/Conversation.js');

    const [userA, userB, userC] = await User.create([
      {
        full_name: 'User A',
        email: 'usera@test.local',
        password: 'hashed',
        role: 'user',
        email_verified: true,
      },
      {
        full_name: 'User B',
        email: 'userb@test.local',
        password: 'hashed',
        role: 'psychiatrist',
        email_verified: true,
        verification_status: 'approved',
      },
      {
        full_name: 'User C',
        email: 'userc@test.local',
        password: 'hashed',
        role: 'user',
        email_verified: true,
      },
    ]);

    userAId = userA._id.toString();
    userBId = userB._id.toString();
    userCId = userC._id.toString();

    await Conversation.create({
      participants: [userA._id, userB._id],
      user_id: userA._id,
      psychiatrist_id: userB._id,
      status: 'active',
    });

    tokenA = signAccessToken({ sub: userAId, role: 'user', emailVerified: true });
    tokenC = signAccessToken({ sub: userCId, role: 'user', emailVerified: true });

    const chatRoutes = (await import('../src/routes/chatRoutes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/chat', chatRoutes);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/chat/users');
    expect(res.status).toBe(401);
  });

  it('allows authenticated user to list conversation peers', async () => {
    const res = await request(app)
      .get('/api/chat/users')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((u: { userId: string }) => u.userId === userBId)).toBe(true);
  });

  it('allows participant to read shared messages', async () => {
    const res = await request(app)
      .get(`/api/chat/messages/${userAId}/${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('forbids non-participant from reading messages', async () => {
    const res = await request(app)
      .get(`/api/chat/messages/${userAId}/${userBId}`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(res.status).toBe(403);
  });
});
