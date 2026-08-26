const mongoose = require('mongoose');

const chatConversationStateSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['doctor', 'nutritionist', 'manager', 'medicalAssistant'], required: true },
  humanActive: { type: Boolean, default: false },
  takenOverBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  takenOverAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('ChatConversationState', chatConversationStateSchema);
