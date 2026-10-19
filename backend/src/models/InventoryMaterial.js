const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  stock: { type: Number, default: 0, min: 0 },
  linkedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  legacyProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  inventoryTracking: {
    enabled: { type: Boolean, default: true },
    kind: { type: String, enum: ['consumable', 'reusable'], default: 'consumable' },
    unit: { type: String, default: '件' },
    minStock: { type: Number, default: 0 },
    defaultCost: { type: Number, default: 0 },
    location: { type: String, default: '' },
  },
}, { timestamps: true });
schema.index({ tenantId: 1, linkedProductIds: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('InventoryMaterial', schema);
