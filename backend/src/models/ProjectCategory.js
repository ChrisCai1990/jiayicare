const mongoose = require('mongoose');

const projectCategorySchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  parent:    { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  sortOrder: { type: Number, default: 0 },
  status:    { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('ProjectCategory', projectCategorySchema);
