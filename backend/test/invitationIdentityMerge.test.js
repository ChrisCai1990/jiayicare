const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');
const authRoute = fs.readFileSync(path.join(__dirname, '../src/routes/auth.js'), 'utf8');
const adminRoute = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');

test('identity merge transfers a temporary referral code to a legacy profile', () => {
  assert.match(userRoute, /!idOwner\.referralCode && current\.referralCode/);
  assert.match(userRoute, /setData\.referralCode = transferredReferralCode/);
  assert.match(userRoute, /releasedUniqueFields\.referralCode = 1/);
});

test('identity merge preserves one invitation reward and invitation rewards use corporate rules', () => {
  assert.match(userRoute, /current\.referralRewardGrantedAt && !idOwner\.referralRewardGrantedAt/);
  assert.match(userRoute, /transferredInviteRewardIds/);
  assert.match(userRoute, /邀请好友首次使用小程序奖励', 'enterprise'/);
  assert.match(authRoute, /邀请好友首次使用小程序奖励', 'enterprise'/);
});

test('login locks both inviter id and code before onboarding', () => {
  assert.match(authRoute, /pendingInviteCode: code, pendingInviter: inviter\._id/);
  assert.match(userRoute, /applyOnboardingRewards\(user, pendingInviteCode, pendingInviterId\)/);
});

test('admin patient detail exposes both directions of the invitation relationship', () => {
  assert.match(adminRoute, /populate\('invitedBy', 'name phone'\)/);
  assert.match(adminRoute, /User\.find\(\{ invitedBy: userId/);
  assert.match(adminRoute, /user, invitedUsers, latestVitals/);
});
