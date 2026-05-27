const mongoose = require('mongoose');

const memberTypeSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  active:    { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('MemberType', memberTypeSchema);
