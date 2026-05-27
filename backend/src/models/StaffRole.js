const mongoose = require('mongoose');

const staffRoleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  permissions: {
    // 每个模块的权限：{ view, create, edit, delete, audit }
    patients:       { type: Object, default: {} },
    orders:         { type: Object, default: {} },
    messages:       { type: Object, default: {} },
    services:       { type: Object, default: {} },
    products:       { type: Object, default: {} },
    questionnaires: { type: Object, default: {} },
    staff:          { type: Object, default: {} },
    settings:       { type: Object, default: {} },
    projects:       { type: Object, default: {} },
    reports:        { type: Object, default: {} },
    followups:      { type: Object, default: {} },
  },
}, { timestamps: true });

module.exports = mongoose.model('StaffRole', staffRoleSchema);
