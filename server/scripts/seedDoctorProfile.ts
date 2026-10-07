import 'dotenv/config';
import { connectDb, disconnectDb } from '../src/database/connection.js';
import { User } from '../src/models/User.js';
import { PsychiatristProfile } from '../src/models/PsychiatristProfile.js';

async function seedDoctor() {
  await connectDb();
  const user = await User.findOne({ email: 'doctor@example.com' });
  if (!user) {
    console.log('Doctor user not found');
    await disconnectDb();
    return;
  }
  await PsychiatristProfile.findOneAndUpdate(
    { user_id: user._id },
    {
      $set: {
        user_id: user._id,
        specialization: 'Clinical Psychiatry & Psychotherapy',
        license_number: 'MD-ET-98231',
        years_of_experience: 12,
        hospital_or_clinic: 'Addis Ababa Central Hospital',
        approval_status: 'approved',
        admin_feedback: 'Approved by system administrator.',
        uploaded_documents: [
          {
            url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800',
            document_type: 'license',
            uploaded_at: new Date(),
          },
        ],
      },
    },
    { upsert: true, new: true }
  );
  console.log('PsychiatristProfile created/updated for Dr. Sarah Connor');
  await disconnectDb();
}

seedDoctor();
