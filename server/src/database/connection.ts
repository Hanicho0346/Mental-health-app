import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
}
