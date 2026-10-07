import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logServerInfo } from '../utils/logger.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  logServerInfo('mongodb.connected', {});
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  logServerInfo('mongodb.disconnected', {});
}

export async function pingDb(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}
