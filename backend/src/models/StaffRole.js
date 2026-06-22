const mongoose = require('mongoose');

const staffRoleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  permissions: {
    // 医护端模块权限：{ view, create, edit, delete, audit, send }
    patients:        { type: Object, default: {} },
    followups:       { type: Object, default: {} },
    plans:           { type: Object, default: {} },
    reports:         { type: Object, default: {} },
    abnormal_review: { type: Object, default: {} },
    service_records: { type: Object, default: {} },
    knowledge:       { type: Object, default: {} },
    questionnaires:  { type: Object, default: {} },
    products:        { type: Object, default: {} },
    commission:      { type: Object, default: {} },
    marketing:       { type: Object, default: {} },
    team:            { type: Object, default: {} },
    operations:      { type: Object, default: {} },
    daily_checkin:   { type: Object, default: {} },
  },
}, { timestamps: true });

module.exports = mongoose.model('StaffRole', staffRoleSchema);
