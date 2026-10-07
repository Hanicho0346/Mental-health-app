import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/database/connection.js';
import { User } from '../src/models/User.js';

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'AdminPass123!';
  const adminName = process.env.ADMIN_NAME ?? 'System Administrator';

  console.log('[Seed] Connecting to MongoDB...');
  await connectDb();

  try {
    const existing = await User.findOne({ email: adminEmail.toLowerCase() });
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    if (existing) {
      console.log(`[Seed] Admin user already exists (${adminEmail}). Updating role and resetting password...`);
      existing.role = 'admin';
      existing.email_verified = true;
      existing.is_approved = true;
      existing.password = passwordHash;
      await existing.save();
      console.log(`\n==================================================`);
      console.log(`[Seed] Admin user updated successfully!`);
      console.log(`Email:    ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
      console.log(`==================================================\n`);
    } else {
      await User.create({
        full_name: adminName,
        email: adminEmail.toLowerCase(),
        password: passwordHash,
        role: 'admin',
        email_verified: true,
        is_approved: true,
        verification_status: 'approved',
      });
      console.log(`\n==================================================`);
      console.log(`[Seed] Admin user created successfully!`);
      console.log(`Email:    ${adminEmail}`);
      console.log(`Password: ${adminPassword}`);
      console.log(`==================================================\n`);
    }
  } catch (err) {
    console.error('[Seed] Failed to seed admin user:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
    console.log('[Seed] Done.');
  }
}

seedAdmin();
