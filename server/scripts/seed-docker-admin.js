const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mentalhealth';
  console.log('Connecting to', mongoUri);
  await mongoose.connect(mongoUri);

  const hash = await bcrypt.hash('AdminPass123!', 10);

  const emails = ['admin@example.com', 'hanagebremedhin2019@gmail.com'];

  for (const email of emails) {
    const res = await mongoose.connection.db.collection('users').updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          full_name: 'System Administrator',
          email: email.toLowerCase(),
          password: hash,
          role: 'admin',
          email_verified: true,
          is_approved: true,
          verification_status: 'approved',
          account_status: 'active',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        }
      },
      { upsert: true }
    );
    console.log(`Seeded ${email}:`, res);
  }

  await mongoose.disconnect();
  console.log('Done seeding admin accounts.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
