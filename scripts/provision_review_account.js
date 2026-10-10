#!/usr/bin/env node
// Create a synthetic account for temporary WeChat review. No password is stored here.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
const mongoose = require('mongoose');
const User = require('../backend/src/models/User');
const { jiayihuiTenantId } = require('../backend/src/utils/jiayihuiTenant');

async function main() {
  if (process.argv[2] !== '--apply') throw new Error('Pass --apply to provision the review account');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const tenantId = await jiayihuiTenantId();
    let user = await User.findOne({ tenantId, 'reviewExperience.enabled': true, isDeleted: false });
    if (!user) user = await User.create({
      tenantId,
      name: '微信审核体验账号',
      clientBrand: 'jiayiguanjia',
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      residence: { province: '浙江省', city: '杭州市', district: '西湖区' },
      reviewExperience: { enabled: true },
    });
    if (user.phone || user.wechatMpOpenid || user.wechatOpenid) throw new Error('Review account unexpectedly has a real login identity');
    console.log(String(user._id));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
