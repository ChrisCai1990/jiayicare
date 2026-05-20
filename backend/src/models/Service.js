const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  serviceId:    { type: String, required: true, unique: true }, // 如 S1, S2
  category:     { type: String, required: true },
  name:         { type: String, required: true },
  subtitle:     { type: String, default: '' },
  price:        { type: Number, required: true },
  originalPrice:{ type: Number, required: true },
  rating:       { type: Number, default: 4.8, min: 0, max: 5 },
  reviewCount:  { type: Number, default: 0 },
  tag:          { type: String, default: '' },
  tagColor:     { type: String, default: '' },
  icon:         { type: String, default: 'star-outline' },
  iconColor:    { type: String, default: '#1E6B50' },
  features:     [{ type: String }],
  active:       { type: Boolean, default: true },
  sortOrder:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
