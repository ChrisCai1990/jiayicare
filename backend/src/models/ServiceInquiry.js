const mongoose = require('mongoose');

const serviceInquirySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  specificationLabel: { type: String, default: '' },
  note: { type: String, default: '' },
  status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new', index: true },
  convertedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true });

module.exports = mongoose.model('ServiceInquiry', serviceInquirySchema);
