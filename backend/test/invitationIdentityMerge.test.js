const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');

test('identity merge transfers a temporary referral code to a legacy profile', () => {
  assert.match(userRoute, /!idOwner\.referralCode && current\.referralCode/);
  assert.match(userRoute, /setData\.referralCode = transferredReferralCode/);
  assert.match(userRoute, /releasedUniqueFields\.referralCode = 1/);
});
