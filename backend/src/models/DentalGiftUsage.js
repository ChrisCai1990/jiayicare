const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String, patientId: mongoose.Schema.Types.ObjectId, enterpriseId: mongoose.Schema.Types.ObjectId,
  status: { type: String, enum: ['unknown','available','booked','used'], default: 'unknown' },
  institution: String, appointmentDate: String, completedDate: String,
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, versionKey: '__v' });
module.exports = mongoose.model('DentalGiftUsage', schema);
