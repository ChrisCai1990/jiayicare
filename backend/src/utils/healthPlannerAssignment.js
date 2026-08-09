const Admin = require('../models/Admin');
const User = require('../models/User');

async function resolveHealthPlanner(userOrId) {
  const patient = userOrId?.assignedHealthPlanner !== undefined
    ? userOrId
    : await User.findById(userOrId).select('assignedHealthPlanner tenantId');
  if (!patient) return null;
  if (patient.assignedHealthPlanner) return patient.assignedHealthPlanner;

  const filter = { role: 'healthPlanner', staffStatus: 'active' };
  if (patient.tenantId) filter.tenantId = patient.tenantId;
  return (await Admin.findOne(filter).sort({ createdAt: 1 }).select('_id'))?._id || null;
}

module.exports = { resolveHealthPlanner };
