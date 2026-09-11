const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadQuickHealthParser() {
  const vm = require('node:vm');
  const source = read('src/pages/checkin/index.jsx');
  const start = source.indexOf('function toLocalDateStr');
  const end = source.indexOf('function Chip');
  assert.ok(start >= 0 && end > start, 'quick health parser source should be discoverable');
  const parserSource = source.slice(start, end).replace('export function parseQuickHealthText', 'function parseQuickHealthText');
  const context = { Date };
  vm.runInNewContext(`${parserSource}\nthis.parseQuickHealthText = parseQuickHealthText;`, context);
  return context.parseQuickHealthText;
}

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

test('all check-in dialogs support record dates and optional camera uploads', () => {
  const source = read('src/pages/checkin/index.jsx');
  assert.match(source, /renderDatePicker\(measureModal\.color\)/);
  assert.match(source, /renderDatePicker\(colors\.danger\)/);
  assert.match(source, /renderImagePicker\(measureImages/);
  assert.match(source, /!\['bloodPressure', 'bloodSugar', 'weight'\]\.includes/);
  assert.match(source, /renderImagePicker\(symptomImages/);
  assert.match(source, /sourceType: \['album', 'camera'\]/);
});

test('weight entry supports jin and shows automatic kilogram conversion', () => {
  const source = read('src/pages/checkin/index.jsx');
  const photo = read('src/components/WeightPhoto.jsx');
  assert.match(source, /weightUnit === '斤' \? enteredValue \/ 2/);
  assert.match(source, /＝ \{Math\.round/);
  assert.match(photo, /unit === '斤' \? number \/ 2/);
  assert.match(photo, /支持 kg（公斤）和斤/);
});

test('one daily batch form can save multiple categories and all three meals', () => {
  const source = read('src/pages/checkin/index.jsx');
  assert.match(source, /多日快速补录/);
  assert.match(source, /\['breakfast', '早餐'\]/);
  assert.match(source, /\['lunch', '午餐'\]/);
  assert.match(source, /\['dinner', '晚餐'\]/);
  assert.match(source, /Promise\.allSettled\(rows\.map/);
  assert.match(source, /保存当天已填项目/);
  assert.match(source, /像发消息一样粘贴多日数据/);
  assert.match(source, /parseQuickHealthText/);
  assert.match(source, /今日空腹体重：137\.8斤/);
  assert.match(source, /昨日饮水量：约1200ml/);
});

test('calendar history failure does not suppress the existing today status', () => {
  const source = read('src/pages/checkin/index.jsx');
  assert.match(source, /Promise\.allSettled\(\[\s*recordsAPI\.todayStatus\(\),\s*recordsAPI\.checkinCalendar\(365\)/);
  assert.match(source, /statusResult\.status === 'fulfilled'/);
  assert.match(source, /calendarResult\.status === 'fulfilled'/);
});

test('customer message is split into dated records and jin is converted to kg', () => {
  const parse = loadQuickHealthParser();
  const rows = parse([
    '👉今日空腹体重：137.8斤',
    '👉昨日饮水量：约1200ml',
    '👉昨日排便次数：1次',
    '👉昨天运动步数：约9736步，并约10分钟抗阻增肌练习',
  ].join('\n'), '2026-09-11', '2026-09-11');
  assert.deepEqual(Array.from(rows, row => row.type), ['weight', 'water', 'bowel', 'exercise']);
  assert.equal(rows[0].value, '68.9');
  assert.equal(rows[0].unit, 'kg');
  assert.equal(rows[0].recordedAt.slice(0, 10), '2026-09-11');
  assert.equal(rows[1].recordedAt, '2026-09-10T12:00:00');
  assert.equal(rows[2].recordedAt, '2026-09-10T12:00:00');
  assert.equal(rows[3].recordedAt, '2026-09-10T12:00:00');
  assert.deepEqual(Array.from(rows.unmatchedLines), []);
});

test('quick parser ignores the message heading and reports unrecognized lines', () => {
  const parse = loadQuickHealthParser();
  const rows = parse('每日健康数据记录☀️\n昨日饮水：1200ml\n昨天感觉还可以', '2026-09-11', '2026-09-11');
  assert.deepEqual(Array.from(rows, row => row.type), ['water']);
  assert.deepEqual(Array.from(rows.unmatchedLines), ['昨天感觉还可以']);
});

test('sleep requires bedtime and wake time, calculates duration, and belongs to wake date', () => {
  const parse = loadQuickHealthParser();
  const rows = parse('昨晚22:30入睡，今早6:30起床', '2026-09-11', '2026-09-11');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'sleep');
  assert.equal(rows[0].value, '8.0');
  assert.equal(rows[0].unit, '小时');
  assert.equal(rows[0].extra.sleepTime, '22:30');
  assert.equal(rows[0].extra.wakeTime, '06:30');
  assert.equal(rows[0].recordedAt.slice(0, 10), '2026-09-11');
  assert.deepEqual(Array.from(rows.unmatchedLines), []);
});

test('incomplete sleep text is not silently saved', () => {
  const parse = loadQuickHealthParser();
  const rows = parse('昨日睡眠7小时', '2026-09-11', '2026-09-11');
  assert.equal(rows.length, 0);
  assert.match(rows.unmatchedLines[0], /睡眠需同时写明入睡和起床时间/);
});

test('partial batch failures retain only failed entries for retry', () => {
  const source = read('src/pages/checkin/index.jsx');
  assert.match(source, /failedQuickLines/);
  assert.match(source, /successfulInputKeys/);
  assert.match(source, /页面只保留失败项，可直接重试/);
  assert.match(source, /还有\$\{rows\.unmatchedLines\.length\}行未识别/);
  assert.match(source, /未识别，保存前请修改或删除/);
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

test('conversation bottom waits for layout and polling does not replace unchanged messages', () => {
  const source = read('src/pages/messages/index.jsx');
  assert.match(source, /messageSignatureRef/);
  assert.match(source, /signature !== messageSignatureRef\.current/);
  assert.match(source, /setTimeout\(\(\) => setScrollTop\(nextTop \+ 1\), 80\)/);
  assert.match(source, /id="thread-bottom" style=\{\{ height: '72px'/);
});
