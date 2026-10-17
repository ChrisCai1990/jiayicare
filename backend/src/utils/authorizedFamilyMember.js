// A confirmed adult relationship is usable only while both accounts still link each other.
async function authorizedFamilyMember(actor, memberId, users = require('../models/User')) {
  if (!actor?._id || !memberId || String(actor._id) === String(memberId)) return null;
  const scope = { tenantId: actor.tenantId || null, isDeleted: { $ne: true } };
  const owner = await users.findOne({ _id: actor._id, ...scope, patientCategory: { $ne: 'child' } }).select('familyLinks').lean();
  if (!owner?.familyLinks?.some(link => String(link.linkedUser) === String(memberId))) return null;
  const member = await users.findOne({ _id: memberId, ...scope, patientCategory: { $ne: 'child' } }).lean();
  if (!member?.familyLinks?.some(link => String(link.linkedUser) === String(actor._id))) return null;
  return member;
}

module.exports = { authorizedFamilyMember };
