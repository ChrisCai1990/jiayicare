const Link = require('../models/WecomAppLink');

// The employee requests a change to the binding shown on their page. The
// administrator must later confirm that same binding, not a replacement.
async function requestUnbind({ staffId, tenantId, corpId, expectedUserId }) {
  if (!corpId || typeof expectedUserId !== 'string' || !expectedUserId.trim()) return false;
  const result = await Link.findOneAndUpdate(
    { staffId, tenantId: tenantId || null, corpId, userId: expectedUserId, unbindRequestedAt: { $exists: false } },
    { $set: { unbindRequestedAt: new Date(), unbindRequestedBy: staffId, unbindRequestedUserId: expectedUserId } },
    { new: true },
  ).select('_id').lean();
  return !!result;
}

async function confirmUnbind({ staffId, tenantId, corpId, expectedUserId, actorId }) {
  if (!corpId || typeof expectedUserId !== 'string' || !expectedUserId.trim() || !actorId) return false;
  const result = await Link.findOneAndUpdate(
    { staffId, tenantId: tenantId || null, corpId, userId: expectedUserId, unbindRequestedUserId: expectedUserId, unbindRequestedAt: { $exists: true } },
    { $unset: { userId: 1, pairHash: 1, pairExpires: 1, unbindRequestedAt: 1, unbindRequestedBy: 1, unbindRequestedUserId: 1 }, $set: { remindersEnabled: false, lastUnboundAt: new Date(), lastUnboundBy: actorId, lastUnboundByRole: 'superadmin' } },
    { new: true },
  ).select('_id').lean();
  return !!result;
}

module.exports = { requestUnbind, confirmUnbind };
