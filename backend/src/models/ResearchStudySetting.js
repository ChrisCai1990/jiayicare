const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  studyCode: { type: String, required: true, unique: true },
  governanceReference: { type: String, required: true, trim: true, maxlength: 200 },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  verifiedAt: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('ResearchStudySetting', schema);
