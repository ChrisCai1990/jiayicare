const mongoose = require('mongoose');

// 随访表单模板（动态字段）
const fieldSchema = new mongoose.Schema({
  type:     { type: String, enum: ['text', 'number', 'radio', 'checkbox', 'textarea', 'date'], required: true },
  label:    { type: String, required: true },
  required: { type: Boolean, default: false },
  options:  [String], // 用于 radio / checkbox
}, { _id: false });

const followUpFormSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true },
  fields: [fieldSchema],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('FollowUpForm', followUpFormSchema);
