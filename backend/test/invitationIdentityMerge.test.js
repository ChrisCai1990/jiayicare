const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');
const authRoute = fs.readFileSync(path.join(__dirname, '../src/routes/auth.js'), 'utf8');
const adminRoute = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const questionnaireRoute = fs.readFileSync(path.join(__dirname, '../src/routes/questionnaire.js'), 'utf8');
const questionnaireReward = fs.readFileSync(path.join(__dirname, '../src/utils/referralQuestionnaireReward.js'), 'utf8');

test('identity merge transfers a temporary referral code to a legacy profile', () => {
  assert.match(userRoute, /!idOwner\.referralCode && current\.referralCode/);
  assert.match(userRoute, /setData\.referralCode = transferredReferralCode/);
  assert.match(userRoute, /releasedUniqueFields\.referralCode = 1/);
});

test('identity merge preserves a previously granted invitation reward', () => {
  assert.match(userRoute, /current\.referralRewardGrantedAt && !idOwner\.referralRewardGrantedAt/);
  assert.match(userRoute, /transferredInviteRewardIds/);
  assert.match(questionnaireReward, /邀请好友完成问卷奖励/);
  assert.match(questionnaireReward, /source: 'enterprise'/);
});

test('login locks both inviter id and code before onboarding', () => {
  assert.match(authRoute, /pendingInviteCode: code, pendingInviter: inviter\._id/);
  assert.match(userRoute, /applyOnboardingRewards\(user, pendingInviteCode, pendingInviterId\)/);
});

test('invitation is recorded at onboarding but its reward waits for questionnaire submission', () => {
  assert.match(userRoute, /建档成功即固定邀请人，基金奖励改由首次问卷提交后统一发放/);
  assert.match(questionnaireRoute, /grantReferralQuestionnaireReward\(req\.user\._id\)/);
  assert.match(questionnaireReward, /onboardingCompleted: true/);
  assert.match(questionnaireReward, /referralRewardGrantedAt: null/);
});

test('admin patient detail exposes both directions of the invitation relationship', () => {
  assert.match(adminRoute, /populate\('invitedBy', 'name phone'\)/);
  assert.match(staffRoute, /populate\('invitedBy', 'name phone'\)/);
  assert.match(adminRoute, /User\.find\(\{ invitedBy: userId/);
  assert.match(adminRoute, /user, invitedUsers, latestVitals/);
});
