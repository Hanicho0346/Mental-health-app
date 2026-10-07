import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/database/connection.js';
import { User } from '../src/models/User.js';
import { PsychiatristProfile } from '../src/models/PsychiatristProfile.js';

const FIRST_NAMES = [
  'Abebe', 'Almaz', 'Bekele', 'Chala', 'Dawit', 'Eleni', 'Fikre', 'Getachew', 'Hana', 'Isaias',
  'Jemila', 'Kassahun', 'Lema', 'Mulu', 'Nardos', 'Obang', 'Petros', 'Rahwa', 'Solomon', 'Tigist',
  'Yonas', 'Zenebe', 'Aster', 'Biniam', 'Derartu', 'Ephrem', 'Frehiwot', 'Girma', 'Haile', 'Kebra'
];

const LAST_NAMES = [
  'Tadesse', 'Alemu', 'Haile', 'Girma', 'Kassa', 'Worku', 'Tesfaye', 'Mekonnen', 'Assefa', 'Tekle',
  'Mengistu', 'Demissie', 'Bogale', 'Cherenet', 'Fikadu', 'Gebre', 'Kebede', 'Lema', 'Molla', 'Negash'
];

const SPECIALIZATIONS = [
  'Clinical Psychiatry', 'Child & Adolescent Psychiatry', 'Addiction Psychiatry',
  'Forensic Psychiatry', 'Geriatric Psychiatry', 'Neuropsychiatry', 'Behavioral Therapy'
];

const MOODS = ['Happy', 'Calm', 'Anxious', 'Hopeful', 'Reflective', 'Motivated', 'Tired', 'Grateful'];
const TIERS = ['free', 'student', 'premier'] as const;

async function seed70Members() {
  console.log('[Seed 70 Members] Connecting to MongoDB...');
  await connectDb();

  try {
    const defaultPasswordHash = await bcrypt.hash('Password123!', 10);
    console.log('[Seed 70 Members] Generating 70 member records...');

    let createdCount = 0;

    for (let i = 1; i <= 70; i++) {
      const fn = FIRST_NAMES[(i - 1) % FIRST_NAMES.length];
      const ln = LAST_NAMES[(i - 1) % LAST_NAMES.length];
      const fullName = `${fn} ${ln} ${i > 20 ? i : ''}`.trim();
      const email = `member${i}@example.com`;

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        continue;
      }

      const isDoctor = i % 4 === 0; // ~17 doctors, rest regular users
      const role = isDoctor ? 'psychiatrist' : 'user';
      const tier = TIERS[i % TIERS.length];
      const mood = MOODS[i % MOODS.length];

      if (isDoctor) {
        const spec = SPECIALIZATIONS[i % SPECIALIZATIONS.length];
        const license = `MD-${70000 + i}`;
        const nationalId = `ETH-${800000 + i}`;

        const docUser = await User.create({
          full_name: fullName,
          email: email.toLowerCase(),
          password: defaultPasswordHash,
          role: 'psychiatrist',
          email_verified: true,
          is_approved: true,
          verification_status: 'approved',
          national_id: nationalId,
          medical_license: license,
          specialization: spec,
          experience_years: (i % 15) + 1,
          hospital_or_clinic: `Health Clinic #${(i % 10) + 1}`,
          account_status: 'active',
          avatar_url: `https://i.pravatar.cc/150?u=${email}`,
          subscription_tier: tier,
          is_premier: tier === 'premier',
        });

        await PsychiatristProfile.create({
          user_id: docUser._id,
          specialization: spec,
          license_number: license,
          years_of_experience: (i % 15) + 1,
          approval_status: 'approved',
        });
      } else {
        await User.create({
          full_name: fullName,
          email: email.toLowerCase(),
          password: defaultPasswordHash,
          role: 'user',
          email_verified: true,
          is_approved: true,
          account_status: 'active',
          avatar_url: `https://i.pravatar.cc/150?u=${email}`,
          mood_status: mood,
          subscription_tier: tier,
          is_premier: tier === 'premier',
        });
      }

      createdCount++;
    }

    const totalUsers = await User.countDocuments();
    console.log(`\n==================================================`);
    console.log(`[Seed] Created ${createdCount} new member records!`);
    console.log(`[Seed] Total Users currently in Database: ${totalUsers}`);
    console.log(`[Seed] All new accounts have password: Password123!`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('[Seed] Error seeding 70 members:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
    console.log('[Seed] Done.');
  }
}

seed70Members();
