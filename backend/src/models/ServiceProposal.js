const mongoose = require('mongoose');

const serviceProposalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planner: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  customerNeed: { type: String, default: '' },
  proposalText: { type: String, required: true },
  recommendedProducts: [{ productId: mongoose.Schema.Types.ObjectId, name: String, price: Number, reason: String }],
  confidence: { type: Number, default: 0 },
  reviewNote: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
}, { timestamps: true });

serviceProposalSchema.index({ user: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('ServiceProposal', serviceProposalSchema);
