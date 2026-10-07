// Run with: docker exec -i mh-mongodb mongosh mentalhealth < scripts/docker-seed.js
// These hashes were generated with bcrypt cost=10:
//   AdminPass123! -> adminHash
//   Password123!  -> commonHash

const adminHash  = '$2b$10$i4iQg.DMX8U4AwG/3DG53OW3/rPa.r2CxvygRqGQ69Bsb2wxDRNjG';
const commonHash = '$2b$10$P1z8SnRIvOff6X63iS/6CuC51SvWOupl7T8EsG3lzuFIhrMQm1kEG';

db.users.drop();

db.users.insertMany([
  {
    full_name: 'System Administrator',
    email: 'admin@example.com',
    password: adminHash,
    role: 'admin',
    email_verified: true,
    is_approved: true,
    account_status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    full_name: 'Hana Admin',
    email: 'hanagebremedhin2019@gmail.com',
    password: adminHash,
    role: 'admin',
    email_verified: true,
    is_approved: true,
    account_status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    full_name: 'Dr. Sarah Connor',
    email: 'doctor@example.com',
    password: commonHash,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    full_name: 'Dr. Alex Mercer',
    email: 'pending.doctor@example.com',
    password: commonHash,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    full_name: 'Abebe Bikila',
    email: 'user@example.com',
    password: commonHash,
    role: 'user',
    email_verified: true,
    is_approved: true,
    account_status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]);

// Seed 70 members
const firstNames = ['Abebe','Almaz','Bekele','Chala','Dawit','Eleni','Fikre','Getachew','Hana','Isaias','Jemila','Kassahun','Lema','Mulu','Nardos','Obang','Petros','Rahwa','Solomon','Tigist','Yonas','Zenebe','Aster','Biniam','Derartu','Ephrem','Frehiwot','Girma','Haile','Kebra'];
const lastNames  = ['Tadesse','Alemu','Haile','Girma','Kassa','Worku','Tesfaye','Mekonnen','Assefa','Tekle','Mengistu','Demissie','Bogale','Cherenet','Fikadu','Gebre','Kebede','Lema','Molla','Negash'];
const specs      = ['Clinical Psychiatry','Child & Adolescent Psychiatry','Addiction Psychiatry','Forensic Psychiatry','Geriatric Psychiatry','Neuropsychiatry','Behavioral Therapy'];
const moods      = ['Happy','Calm','Anxious','Hopeful','Reflective','Motivated','Tired','Grateful'];
const tiers      = ['free','student','premier'];

const members = [];
for (let i = 1; i <= 70; i++) {
  const fn   = firstNames[(i - 1) % firstNames.length];
  const ln   = lastNames[(i - 1)  % lastNames.length];
  const name = (fn + ' ' + ln + (i > 20 ? ' ' + i : '')).trim();
  const email = 'member' + i + '@example.com';
  const isDoctor = (i % 4 === 0);
  const tier = tiers[i % tiers.length];

  if (isDoctor) {
    members.push({
      full_name: name,
      email: email,
      password: commonHash,
      role: 'psychiatrist',
      email_verified: true,
      is_approved: true,
      verification_status: 'approved',
      national_id: 'ETH-' + (800000 + i),
      medical_license: 'MD-' + (70000 + i),
      specialization: specs[i % specs.length],
      experience_years: (i % 15) + 1,
      hospital_or_clinic: 'Health Clinic #' + ((i % 10) + 1),
      account_status: 'active',
      subscription_tier: tier,
      is_premier: tier === 'premier',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    members.push({
      full_name: name,
      email: email,
      password: commonHash,
      role: 'user',
      email_verified: true,
      is_approved: true,
      account_status: 'active',
      mood_status: moods[i % moods.length],
      subscription_tier: tier,
      is_premier: tier === 'premier',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
db.users.insertMany(members);

print('✅ Seeded total users:', db.users.countDocuments());
print('   Admins:       ', db.users.countDocuments({ role: 'admin' }));
print('   Psychiatrists:', db.users.countDocuments({ role: 'psychiatrist' }));
print('   Users:        ', db.users.countDocuments({ role: 'user' }));
