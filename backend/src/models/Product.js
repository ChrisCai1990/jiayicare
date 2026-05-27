const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  images:        [{ type: String }],
  originalPrice: { type: Number, required: true },
  memberPrices:  { type: mongoose.Schema.Types.Mixed, default: {} }, // {"年度会员": 980, ...}
  category:      { type: String, required: true },
  sortOrder:     { type: Number, default: 999 },
  features:      [{ type: String }],
  description:   { type: String, default: '' },
  stock:         { type: Number, default: 0 },
  sales:         { type: Number, default: 0 },
  status:        { type: String, enum: ['on', 'off'], default: 'off' },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
