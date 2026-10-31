const Link = require('../models/WecomAppLink');

// Require the binding shown to the operator. A stale page must not remove a
// newly paired account after another operator has changed it.
async function unbind({ staffId, tenantId, corpId, expectedUserId, actorId, actorRole }) {
  if (!corpId || typeof expectedUserId !== 'string' || !expectedUserId.trim() || !actorId || !['staff', 'superadmin'].includes(actorRole)) return false;
  const result = await Link.findOneAndUpdate(
    { staffId, tenantId: tenantId || null, corpId, userId: expectedUserId },
    { $unset: { userId: 1, pairHash: 1, pairExpires: 1 }, $set: { remindersEnabled: false, lastUnboundAt: new Date(), lastUnboundBy: actorId, lastUnboundByRole: actorRole } },
    { new: true },
  ).select('_id').lean();
  return !!result;
}

module.exports = { unbind };
