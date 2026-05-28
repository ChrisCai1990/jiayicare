const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  subtitle:      { type: String, default: '' },
  images:        [{ type: String }],
  originalPrice: { type: Number, required: true },
  servicePrices: [{ label: { type: String }, price: { type: Number } }],
  memberPrices:  { type: mongoose.Schema.Types.Mixed, default: {} },
  category:      { type: String, required: true },
  sortOrder:     { type: Number, default: 999 },
  features:      [{ type: String }],
  description:   { type: String, default: '' },
  stock:         { type: Number, default: 0 },
  sales:         { type: Number, default: 0 },
  status:        { type: String, enum: ['on', 'off'], default: 'off' },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
