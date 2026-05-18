const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  category:    { type: String },
  type:        { type: String }, // record, followup, questionnaire, checkup, consultation, upload
  priority:    { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  status:      { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  dueDate:     { type: String },
  dueTime:     { type: String },
  assignee:    { type: String },
  completedAt: { type: Date },
}, { timestamps: true });

taskSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);
