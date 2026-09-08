const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('blood pressure consent button respects WeChat four-character limit', () => {
  const source = read('src/components/BloodPressurePhoto.jsx');
  assert.match(source, /confirmText: '同意选图'/);
  assert.doesNotMatch(source, /confirmText: '同意并选图'/);
});

test('blood sugar and weight photo capture are additive to manual entry', () => {
  const checkin = read('src/pages/checkin/index.jsx');
  const add = read('src/pages/records/add/index.jsx');
  assert.match(checkin, /<BloodSugarPhoto/);
  assert.match(checkin, /<WeightPhoto/);
  assert.match(checkin, /MEASURE_FIELDS\[measureModal\.measureType\]/);
  assert.match(add, /<BloodSugarPhoto/);
  assert.match(add, /<WeightPhoto/);
  assert.match(add, /activeType\.fields\.map/);
});

test('invite share uses fixed cover while preserving invite code login path', () => {
  const source = read('src/pages/profile/invite/index.jsx');
  assert.match(source, /imageUrl: inviteShareCover/);
  assert.match(source, /\/pages\/auth\/login\/index\?invite=\$\{encodeURIComponent\(code\)\}/);
});

test('startup requests hydrate persisted token before sending', () => {
  const source = read('src/services/api.js');
  assert.match(source, /const requestToken = _token \|\| loadToken\(\)/);
  assert.match(source, /if \(requestToken\) headers\['Authorization'\]/);
  assert.match(source, /if \(requestToken && _token === requestToken\) \{\s*clearToken\(\)/);
  assert.match(source, /\['x-auth-token'\]/);
});

test('photo confirmation values remain large enough to edit on a real device', () => {
  ['BloodPressurePhoto.jsx', 'BloodSugarPhoto.jsx', 'WeightPhoto.jsx'].forEach((name) => {
    const source = read(`src/components/${name}`);
    assert.match(source, /height: '48px'/);
    assert.match(source, /fontSize: '18px'/);
    assert.match(source, /style=\{inputField\}/);
  });
});

test('full 100-message windows detect new messages by newest id, not length', () => {
  const source = read('src/pages/messages/index.jsx');
  assert.match(source, /latestMessageIdRef/);
  assert.match(source, /nextMessages\[nextMessages\.length - 1\]\?\._id/);
  assert.doesNotMatch(source, /nextMessages\.length > loadedMessageCountRef\.current/);
});

test('mall supports keyword search and explicit product sharing', () => {
  const source = read('src/pages/services/mall/index.jsx');
  assert.match(source, /placeholder="搜索服务名称或内容"/);
  assert.match(source, /openType="share"/);
  assert.match(source, /分享当前服务给好友/);
  assert.match(source, /`productId=\$\{detailService\.id\}`/);
  assert.match(source, /shareReady=\{!user \|\| !!shareToken\}/);
});

test('paid service checkout keeps money in cents and requires scheduling details', () => {
  const source = read('src/pages/services/mall/index.jsx');
  assert.match(source, /Math\.round\(Math\.min\(fundBalance, fundMaximum\) \* 100\) \/ 100/);
  assert.match(source, /fundApplied\.toFixed\(2\)/);
  assert.match(source, /请选择期望服务时间/);
  assert.match(source, /请填写具体服务需求/);
  assert.match(source, /desiredServiceDate, serviceRequirements\.trim\(\)/);
});

test('completed questionnaire pushes are never reclassified as system notices', () => {
  const source = read('src/pages/messages/index.jsx');
  assert.match(source, /m\.type !== 'questionnaire' && !careMessages\.includes\(m\)/);
  assert.match(source, /item\.type !== 'questionnaire'/);
});

test('notification categories clear their visible unread records without clearing pending questionnaires', () => {
  const source = read('src/pages/messages/index.jsx');
  const api = read('src/services/api.js');
  assert.match(source, /if \(tab === '待填问卷'\) return;/);
  assert.match(source, /messagesAPI\.markBatchRead\(messageIds, pushRecordIds\)/);
  assert.match(api, /markBatchRead/);
});

test('conversation bottom uses a rendered scroll-into-view anchor', () => {
  const source = read('src/pages/messages/index.jsx');
  assert.match(source, /setBottomAnchorId\(anchorId\)/);
  assert.match(source, /setScrollTarget\(anchorId\)/);
  assert.match(source, /id=\{bottomAnchorId\}/);
});
