const mongoose = require('mongoose');

const memberTypeSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  parent:    { type: mongoose.Schema.Types.ObjectId, ref: 'MemberType', default: null },
  active:    { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('MemberType', memberTypeSchema);
