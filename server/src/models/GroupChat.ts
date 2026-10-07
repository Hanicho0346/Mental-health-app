import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const groupMessageSchema = new Schema(
  {
    group_id:   { type: Schema.Types.ObjectId, ref: 'GroupChat', required: true, index: true },
    from:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content:    { type: String, default: '' },
    type:       { type: String, enum: ['text', 'voice'], default: 'text' },
    fileUrl:    { type: String, default: '' },
    read_by:    [{ type: Schema.Types.ObjectId, ref: 'User' }],
    timestamp:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

groupMessageSchema.index({ group_id: 1, timestamp: -1 });

const groupChatSchema = new Schema(
  {
    name:        { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    created_by:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
    admins:      [{ type: Schema.Types.ObjectId, ref: 'User' }],
    avatar_color:{ type: String, default: '#2563eb' },
    is_active:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

groupChatSchema.index({ members: 1 });
groupChatSchema.index({ created_by: 1 });

export type GroupChatDocument = InferSchemaType<typeof groupChatSchema> & { _id: mongoose.Types.ObjectId };
export type GroupMessageDocument = InferSchemaType<typeof groupMessageSchema> & { _id: mongoose.Types.ObjectId };

export const GroupChat    = mongoose.model('GroupChat',    groupChatSchema);
export const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);
