const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true },
  sortOrder: { type: Number, default: 999 },
}, { timestamps: true });

module.exports = mongoose.model('ProductCategory', productCategorySchema);
