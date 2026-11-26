const mongoose = require('mongoose');
const PushRecord = require('../models/PushRecord');

async function claimPushCheckout(record) {
  const token = new mongoose.Types.ObjectId().toString();
  const lock = await PushRecord.findOneAndUpdate({
    _id: record._id, patientId: record.patientId, withdrawnAt: null,
    $or: [{ checkoutLockUntil: null }, { checkoutLockUntil: { $lt: new Date() } }],
  }, { $set: { checkoutLockToken: token, checkoutLockUntil: new Date(Date.now() + 120000) } });
  if (!lock) return null;
  return () => PushRecord.updateOne({ _id: record._id, checkoutLockToken: token },
    { $set: { checkoutLockUntil: null, checkoutLockToken: '' } });
}

module.exports = { claimPushCheckout };
