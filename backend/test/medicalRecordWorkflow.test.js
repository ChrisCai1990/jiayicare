const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('持续病历保留摘要版本并以追加方式保存病程', () => {
  const model = read('backend/src/models/User.js');
  const route = read('backend/src/routes/staff.js');
  assert.match(model, /medicalRecord:\s*\{/);
  assert.match(model, /summaryHistory/);
  assert.match(model, /courseEntries/);
  assert.match(route, /medical-record\/summary/);
  assert.match(route, /medicalRecord\.summaryHistory[^\n]+\$each/);
  assert.match(route, /medical-record\/course-entries/);
  assert.match(route, /medicalRecord\.courseEntries[^\n]+\$each/);
});

test('医护端提供摘要、时间轴、历史版本和续写入口', () => {
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  const api = read('staff/src/api.js');
  for (const text of ['当前病历摘要', '病程时间轴', '摘要历史版本', '续写病历', '无需重复完整病史']) assert.match(page, new RegExp(text));
  assert.match(api, /updateMedicalRecordSummary/);
  assert.match(api, /addMedicalCourseEntry/);
});
