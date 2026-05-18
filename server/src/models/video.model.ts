import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const videoSchema = new Schema(
  {
    doctor_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    amharic_title: {
      type: String,
      default: '',
      trim: true,
    },

    category: {
      type: String,
      default: '',
      trim: true,
    },

    video_url: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export type VideoDocument = InferSchemaType<typeof videoSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Video = mongoose.model('Video', videoSchema);