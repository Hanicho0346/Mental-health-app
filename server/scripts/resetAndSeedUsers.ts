import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/database/connection.js';
import { User } from '../src/models/User.js';
import { PsychiatristProfile } from '../src/models/PsychiatristProfile.js';

async function resetAndSeedUsers() {
  console.log('[Seed] Connecting to MongoDB...');
  await connectDb();

  try {
    console.log('[Seed] Clearing existing user data...');
    await User.deleteMany({});
    await PsychiatristProfile.deleteMany({});

    const commonPasswordHash = await bcrypt.hash('Password123!', 10);
    const adminPasswordHash = await bcrypt.hash('AdminPass123!', 10);

    // 1. Admin user
    const admin1 = await User.create({
      full_name: 'System Administrator',
      email: 'admin@example.com',
      password: adminPasswordHash,
      role: 'admin',
      email_verified: true,
      is_approved: true,
      account_status: 'active',
    });

    const admin2 = await User.create({
      full_name: 'Hana Admin',
      email: 'hanagebremedhin2019@gmail.com',
      password: adminPasswordHash,
      role: 'admin',
      email_verified: true,
      is_approved: true,
      account_status: 'active',
    });

    // 2. Approved Psychiatrist user
    const doctor = await User.create({
      full_name: 'Dr. Sarah Connor',
      email: 'doctor@example.com',
      password: commonPasswordHash,
      role: 'psychiatrist',
      email_verified: true,
      is_approved: true,
      verification_status: 'approved',
      national_id: 'ETH-123456',
      medical_license: 'MD-987654',
      specialization: 'Clinical Psychiatry',
      experience_years: 8,
      hospital_or_clinic: 'Selam Health Center',
      account_status: 'active',
    });

    await PsychiatristProfile.create({
      user_id: doctor._id,
      specialization: 'Clinical Psychiatry',
      license_number: 'MD-987654',
      years_of_experience: 8,
      approval_status: 'approved',
    });

    // 3. Pending Psychiatrist user
    const pendingDoc = await User.create({
      full_name: 'Dr. Alex Mercer',
      email: 'pending.doctor@example.com',
      password: commonPasswordHash,
      role: 'psychiatrist',
      email_verified: true,
      is_approved: false,
      verification_status: 'pending',
      national_id: 'ETH-654321',
      medical_license: 'MD-112233',
      specialization: 'Child Psychology',
      experience_years: 3,
      hospital_or_clinic: 'City General Hospital',
      account_status: 'active',
    });

    await PsychiatristProfile.create({
      user_id: pendingDoc._id,
      specialization: 'Child Psychology',
      license_number: 'MD-112233',
      years_of_experience: 3,
      approval_status: 'pending',
    });

    // 4. Regular User
    const regularUser = await User.create({
      full_name: 'Abebe Bikila',
      email: 'user@example.com',
      password: commonPasswordHash,
      role: 'user',
      email_verified: true,
      is_approved: true,
      account_status: 'active',
    });

    console.log(`\n==================================================`);
    console.log(`[Seed] Database reset & seeded successfully!`);
    console.log(`--------------------------------------------------`);
    console.log(`Admin 1:       admin@example.com / AdminPass123!`);
    console.log(`Admin 2:       hanagebremedhin2019@gmail.com / AdminPass123!`);
    console.log(`Psychiatrist:  doctor@example.com / Password123!`);
    console.log(`Pending Doc:   pending.doctor@example.com / Password123!`);
    console.log(`User:          user@example.com / Password123!`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error('[Seed] Failed to reset/seed users:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
    console.log('[Seed] Done.');
  }
}

resetAndSeedUsers();
