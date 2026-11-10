const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  discussionId: { type: String, required: true },
  mode: { type: String, enum: ['free', 'reply'], required: true },
  title: { type: String, required: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    webSearch: { type: Boolean, default: false },
    _id: false,
  }],
  clientUpdatedAt: { type: Number, required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, staffId: 1, discussionId: 1 }, { unique: true });
schema.index({ tenantId: 1, staffId: 1, updatedAt: -1 });

module.exports = mongoose.model('AiWorkspaceDiscussion', schema);
