const StaffRole = require('../models/StaffRole');

async function isNutritionistStaff(staff) {
  if (staff?.role === 'nutritionist') return true;
  if (!staff?.customRoleId) return false;
  const role = await StaffRole.findById(staff.customRoleId).select('name').lean();
  const name = String(role?.name || '').trim().toLowerCase();
  return name === '营养师' || name === 'nutritionist';
}

module.exports = { isNutritionistStaff };
