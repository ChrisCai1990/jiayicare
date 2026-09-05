const Admin = require('../models/Admin');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');

async function configuredDefaultPlanner(patient) {
  const config = await SystemConfig.findOne({ key: 'defaultHealthPlannerId' }).lean();
  const base = { role: 'healthPlanner', staffStatus: 'active' };
  if (patient.tenantId) base.tenantId = patient.tenantId;
  if (config?.value) {
    const configured = await Admin.findOne({ ...base, _id: config.value }).select('_id');
    if (configured) return configured._id;
  }
  return (await Admin.findOne({ ...base, name: '嘉医管家' }).select('_id'))?._id
    || (await Admin.findOne(base).sort({ createdAt: 1 }).select('_id'))?._id
    || null;
}

async function ensureAssignedHealthPlanner(userOrId) {
  const patient = userOrId?._id
    ? userOrId
    : await User.findById(userOrId).select('assignedHealthPlanner tenantId');
  if (!patient) return null;
  if (patient.assignedHealthPlanner) {
    const active = await Admin.exists({ _id: patient.assignedHealthPlanner, role: 'healthPlanner', staffStatus: 'active' });
    if (active) return patient.assignedHealthPlanner;
  }
  const plannerId = await configuredDefaultPlanner(patient);
  if (!plannerId) return null;
  await User.updateOne({ _id: patient._id }, { $set: { assignedHealthPlanner: plannerId } });
  patient.assignedHealthPlanner = plannerId;
  return plannerId;
}

async function resolveHealthPlanner(userOrId) {
  const patient = userOrId?.assignedHealthPlanner !== undefined
    ? userOrId
    : await User.findById(userOrId).select('assignedHealthPlanner tenantId');
  if (!patient) return null;
  return ensureAssignedHealthPlanner(patient);
}

module.exports = { resolveHealthPlanner, ensureAssignedHealthPlanner };
