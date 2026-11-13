// Apply explicitly at legacy read endpoints; never change global model behavior.
async function legacyPsychologyFilter(staff) {
  if (staff.role !== 'familyDoctor') return { type: { $ne: 'psychology' } };
  const patients = await require('../models/User').find({ tenantId: staff.tenantId, assignedFamilyDoctor: staff._id, isDeleted: { $ne: true } }).select('_id').lean();
  return { $or: [{ type: { $ne: 'psychology' } }, { patientId: { $in: patients.map(p => p._id) } }] };
}
module.exports = { legacyPsychologyFilter };
