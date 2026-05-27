const mongoose = require('mongoose');

const planTemplateSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['annual_checkup', 'health_management', 'nutrition', 'medical_assist', 'rehab', 'tcm', 'psychology'],
  },
  name:    { type: String, required: true },
  status:  { type: String, enum: ['active', 'inactive'], default: 'active' },
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('PlanTemplate', planTemplateSchema);
