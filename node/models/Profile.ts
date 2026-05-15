import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface IProfile extends Document {
  user: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    imageUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

const Profile: Model<IProfile> = mongoose.model<IProfile>('Profile', profileSchema);
export default Profile;
