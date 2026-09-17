const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  aliases: { type: [String], default: [] },
  level: { type: String, default: '' },
  nature: { type: String, enum: ['', 'public', 'private', 'other'], default: '' },
  region: { type: String, default: '' },
  address: { type: String, default: '' }, // 历史总院地址，兼容保留
  campuses: { type: [String], default: [] }, // 历史院区名称镜像，兼容旧数据与科室选择
  campusDetails: [{
    name: { type: String, required: true },
    address: { type: String, default: '' },
    contactName: { type: String, default: '' },
    contactTitle: { type: String, default: '' },
    phone: { type: String, default: '' },
  }],
  contactName: { type: String, default: '' }, // 医院总联系人
  contactTitle: { type: String, default: '' }, // 医院总联系人职位
  phone: { type: String, default: '' }, // 医院总联系电话
  cooperationStatus: { type: String, enum: ['none', 'contacting', 'cooperating'], default: 'none' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

schema.index({ tenantId: 1, name: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MedicalInstitution', schema);
