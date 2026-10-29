// Reconcile invitations captured by older login code before onboarding.
// Preview: node scripts/bind-pending-invitations.js
// Apply:   node scripts/bind-pending-invitations.js --apply
// This script never grants health fund or changes an existing inviter.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const candidates = await User.find({
    invitedBy: null,
    $or: [{ pendingInviter: { $exists: true, $ne: null } }, { pendingInviteCode: { $exists: true, $nin: ['', null] } }],
  }).select('_id tenantId pendingInviter pendingInviteCode').lean();
  const summary = { candidates: candidates.length, eligible: 0, bound: 0, skipped: 0 };
  for (const user of candidates) {
    const code = String(user.pendingInviteCode || '').trim().toLowerCase();
    let inviter = user.pendingInviter
      ? await User.findOne({ _id: user.pendingInviter, tenantId: user.tenantId, isDeleted: { $ne: true } }).select('_id').lean()
      : null;
    if (inviter && String(inviter._id) === String(user._id)) inviter = null;
    if (!inviter && code) inviter = await User.findOne({
      referralCode: code, tenantId: user.tenantId, isDeleted: { $ne: true }, _id: { $ne: user._id },
    }).select('_id').lean();
    if (!inviter) { summary.skipped++; continue; }
    summary.eligible++;
    if (!apply) continue;
    const result = await User.updateOne(
      { _id: user._id, invitedBy: null },
      { $set: { invitedBy: inviter._id, invitedAt: new Date() }, $unset: { pendingInviter: 1, pendingInviteCode: 1 } },
    );
    summary.bound += result.modifiedCount;
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', ...summary }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
