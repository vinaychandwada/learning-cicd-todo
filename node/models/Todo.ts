import mongoose, { Schema, Document, Types, Model } from 'mongoose';

export interface ITodo extends Document {
  user: Types.ObjectId;
  title: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const todoSchema = new Schema<ITodo>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Todo: Model<ITodo> = mongoose.model<ITodo>('Todo', todoSchema);
export default Todo;
