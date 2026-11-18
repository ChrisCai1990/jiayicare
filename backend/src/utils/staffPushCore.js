const crypto = require('node:crypto');

const CHANNELS = Object.freeze({
  doctor: { field: 'assignedFamilyDoctor', role: 'familyDoctor' },
  manager: { field: 'assignedHealthManager', role: 'healthManager' },
  planner: { field: 'assignedHealthPlanner', role: 'healthPlanner' },
  nutritionist: { field: 'assignedNutritionist', role: 'nutritionist' },
  medicalAssistant: { field: 'assignedMedicalAssistant', role: 'medicalAssistant' },
});

function pushReady(env = process.env) {
  const startAt = new Date(env.STAFF_PUSH_START_AT || '');
  return (env.STAFF_PUSH_ENABLED === 'true' && /^\d+$/.test(env.STAFF_HUAWEI_PUSH_CLIENT_ID || '')
    && typeof env.STAFF_HUAWEI_PUSH_CLIENT_SECRET === 'string' && env.STAFF_HUAWEI_PUSH_CLIENT_SECRET.length >= 16
    && Number.isFinite(startAt.getTime())) ? { startAt } : null;
}

function destination(token) {
  if (typeof token !== 'string' || !token || token.length > 4096 || /\s|[\x00-\x1f\x7f]/.test(token)) {
    const error = new Error('设备推送凭据无效');
    error.status = 400;
    throw error;
  }
  return { _id: crypto.createHash('sha256').update(`huawei:${token}`).digest('hex'), token };
}

function assignee(message, patient, staff) {
  const channel = CHANNELS[message?.recipient];
  if (!channel || !patient || patient.isDeleted || !staff || !patient[channel.field]) return false;
  return String(patient[channel.field]) === String(staff._id)
    && String(patient.tenantId || '') === String(staff.tenantId || '')
    && staff.role === channel.role && staff.staffStatus === 'active' && !staff.mustChangePassword;
}

module.exports = { CHANNELS, pushReady, destination, assignee };
