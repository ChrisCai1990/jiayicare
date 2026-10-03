const mongoose = require('mongoose');
const User = require('../models/User');
const ChildGuardianLink = require('../models/ChildGuardianLink');
const { childAgeStage } = require('./childAgeStage');

async function guardianChild(guardian, childId, models = {}) {
  if (!mongoose.isValidObjectId(childId)) return null;
  const links = models.ChildGuardianLink || ChildGuardianLink;
  const users = models.User || User;
  const link = await links.findOne({ guardian: guardian._id, child: childId, status: 'active' }).lean();
  if (!link) return null;
  const child = await users.findOne({ _id: childId, patientCategory: 'child', isDeleted: { $ne: true },
    tenantId: guardian.tenantId || null }).lean();
  return child && childAgeStage(child.birthDate) ? { child, link } : null;
}

module.exports = { guardianChild };
