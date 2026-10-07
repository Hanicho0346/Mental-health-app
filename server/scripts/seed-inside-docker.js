const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

async function seed() {
  const hash = await bcrypt.hash('AdminPass123!', 10);
  console.log('Generated hash:', hash);

  const mongoCode = `
    db.users.updateOne(
      { email: 'admin@example.com' },
      {
        $set: {
          full_name: 'System Administrator',
          email: 'admin@example.com',
          password: '${hash}',
          role: 'admin',
          email_verified: true,
          is_approved: true,
          verification_status: 'approved',
          account_status: 'active'
        }
      },
      { upsert: true }
    );
    db.users.updateOne(
      { email: 'hanagebremedhin2019@gmail.com' },
      {
        $set: {
          full_name: 'System Administrator',
          email: 'hanagebremedhin2019@gmail.com',
          password: '${hash}',
          role: 'admin',
          email_verified: true,
          is_approved: true,
          verification_status: 'approved',
          account_status: 'active'
        }
      },
      { upsert: true }
    );
    console.log("DOCKER_ADMIN_SEED_SUCCESS");
  `;

  const cmd = `docker exec -i mh-mongodb mongosh mentalhealth --eval "${mongoCode.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  console.log(output);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
