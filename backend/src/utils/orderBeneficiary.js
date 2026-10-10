const mongoose = require('mongoose');
const User = require('../models/User');
const { guardianChild } = require('./guardianChildAccess');

// An accepted adult family link or an active guardian link permits checkout.
// This grants no access to the beneficiary's health archive.
async function resolveOrderBeneficiary(payer, beneficiaryUserId, models = {}) {
  if (!beneficiaryUserId || String(beneficiaryUserId) === String(payer._id)) return payer;
  if (!mongoose.isValidObjectId(beneficiaryUserId)) return null;
  const beneficiary = await (models.User || User).findOne({ _id: beneficiaryUserId, isDeleted: { $ne: true } });
  if (!beneficiary || String(beneficiary.tenantId || '') !== String(payer.tenantId || '')) return null;
  if (beneficiary.patientCategory === 'child') {
    return await (models.guardianChild || guardianChild)(payer, beneficiaryUserId) ? beneficiary : null;
  }
  const payerLink = (payer.familyLinks || []).some(link => String(link.linkedUser) === String(beneficiary._id));
  const recipientLink = (beneficiary.familyLinks || []).some(link => String(link.linkedUser) === String(payer._id));
  return payerLink && recipientLink ? beneficiary : null;
}

module.exports = { resolveOrderBeneficiary };
