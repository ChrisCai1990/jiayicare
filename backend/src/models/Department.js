const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true, trim: true },
  bookable:  { type: Boolean, default: false },
  status:    { type: String, enum: ['active', 'inactive'], default: 'active' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
