const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, default: '' },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalInstitution', required: true, index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalDepartment', required: true, index: true },
  campus: { type: String, default: '' },
  expertise: { type: [String], default: [] },
  diseaseTags: { type: [String], default: [] },
  introduction: { type: String, default: '' },
  licenseNumber: { type: String, default: '' },
  serviceModes: { type: [String], default: [] },
  outpatientSchedule: { type: String, default: '' },
  contactNote: { type: String, default: '' },
  linkedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  recruitmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpertRecruitment', default: null, index: true },
  teamEligible: { type: Boolean, default: false },
  singleConsultationFee: { type: Number, default: null },
  mdtFee: { type: Number, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
}, { timestamps: true });

schema.index({ tenantId: 1, institutionId: 1, departmentId: 1, name: 1 });
schema.index({ tenantId: 1, recruitmentId: 1 }, { unique: true, partialFilterExpression: { recruitmentId: { $type: 'objectId' } } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MedicalExpert', schema);
