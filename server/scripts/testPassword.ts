import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/database/connection.js';
import { User } from '../src/models/User.js';

async function test() {
  await connectDb();
  const hash = await bcrypt.hash('Password123!', 10);
  const u = await User.findOneAndUpdate(
    { email: 'doctor@example.com' },
    {
      $set: {
        password: hash,
        email_verified: true,
        is_approved: true,
        verification_status: 'approved',
        account_status: 'active',
        role: 'psychiatrist'
      }
    },
    { new: true }
  ).select('+password');
  console.log('Doctor updated:', u?.email, u?.full_name, u?.role);
  const match = await bcrypt.compare('Password123!', u?.password || '');
  console.log('Password is Password123! -> match:', match);
  await disconnectDb();
}
test();
