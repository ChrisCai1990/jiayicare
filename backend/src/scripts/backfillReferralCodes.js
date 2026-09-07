#!/usr/bin/env node
// Give every legacy user a stable referral code. Dry-run by default; pass --apply to write.
// The update is idempotent and only touches rows whose code is missing or blank.
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

const APPLY = process.argv.includes('--apply');
const missingFilter = {
  $or: [
    { referralCode: { $exists: false } },
    { referralCode: null },
    { referralCode: '' },
  ],
};

async function allocateCode(userId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const referralCode = crypto.randomBytes(6).toString('hex');
    try {
      const result = await User.updateOne(
        { _id: userId, ...missingFilter },
        { $set: { referralCode } },
      );
      return result.modifiedCount === 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw new Error(`Failed to allocate a unique referral code for ${userId}`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const targets = await User.find(missingFilter).select('_id').lean();
  console.log(`[referral-code] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} missing=${targets.length}`);
  if (!APPLY) return;

  if (targets.length) {
    const backupKey = `referral-code-backfill-v1-${new Date().toISOString()}`;
    await mongoose.connection.collection('maintenance_backups').insertOne({
      backupKey,
      reason: 'Before assigning referral codes to legacy users',
      createdAt: new Date(),
      userIds: targets.map(target => target._id),
    });
    console.log(`[referral-code] backup=${backupKey}`);
  }

  let updated = 0;
  for (const target of targets) {
    if (await allocateCode(target._id)) updated += 1;
  }
  const remaining = await User.countDocuments(missingFilter);
  console.log(`[referral-code] updated=${updated} remaining=${remaining}`);
  if (remaining) throw new Error(`${remaining} users still have no referral code`);
}

main()
  .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
