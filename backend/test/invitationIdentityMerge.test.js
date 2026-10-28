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

test('login fixes inviter before onboarding and does not grant funds', () => {
  assert.match(authRoute, /await bindInvitationAtLogin\(user, inviteCode\)/);
  assert.match(authRoute, /invitedBy: inviter\._id/);
  assert.doesNotMatch(authRoute, /firstLoginFundGrantedAt: now/);
  assert.match(userRoute, /applyOnboardingRewards\(user, pendingInviteCode, pendingInviterId\)/);
});

test('fund grants wait for the first submitted questionnaire', () => {
  assert.match(questionnaireRoute, /grantFirstQuestionnaireReward\(req\.user\._id\)/);
  assert.match(questionnaireRoute, /grantReferralQuestionnaireReward\(req\.user\._id\)/);
  assert.match(questionnaireReward, /firstLoginFundGrantedAt: null/);
  assert.match(questionnaireReward, /onboardingCompleted: true/);
  assert.match(questionnaireReward, /referralRewardGrantedAt: null/);
});

test('admin patient detail exposes both directions of the invitation relationship', () => {
  assert.match(adminRoute, /populate\('invitedBy', 'name phone'\)/);
  assert.match(staffRoute, /populate\('invitedBy', 'name phone'\)/);
  assert.match(adminRoute, /User\.find\(\{ invitedBy: userId/);
  assert.match(adminRoute, /user, invitedUsers, latestVitals/);
});
