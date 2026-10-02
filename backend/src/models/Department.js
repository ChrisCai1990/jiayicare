const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name:      { type: String, required: true, trim: true },
  bookable:  { type: Boolean, default: false },
  status:    { type: String, enum: ['active', 'inactive'], default: 'active' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

departmentSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);
departmentSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
