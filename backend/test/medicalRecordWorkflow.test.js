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

test('每项疾病建立独立专病档案并与管理服务记录分层展示', () => {
  const model = read('backend/src/models/User.js');
  const route = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  const api = read('staff/src/api.js');
  assert.match(model, /diseaseRecords/);
  assert.match(route, /normalizedDiseaseRecords/);
  assert.match(route, /disease-records\/summary/);
  assert.match(route, /disease-records\/course-entries/);
  for (const text of ['专病健康档案', '专病健康信息摘要', '健康变化时间轴', '管理记录', '平台不形成诊疗结论']) assert.match(page, new RegExp(text));
  assert.match(api, /updateDiseaseRecordSummary/);
  assert.match(api, /addDiseaseCourseEntry/);
});

test('专病健康信息保存来源与核验状态', () => {
  const route = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  assert.match(route, /cleanHealthInfoProvenance/);
  assert.match(route, /sourceInstitution/);
  assert.match(route, /verificationStatus/);
  assert.match(page, /客户自述/);
  assert.match(page, /已核对来源材料/);
});

test('健康变化与症状感受统一录入并兼容历史分栏数据', () => {
  const route = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  assert.match(page, /本次健康及症状变化/);
  assert.doesNotMatch(page, /\['symptoms','症状\/感受变化'\]/);
  assert.doesNotMatch(page, /\['symptoms', '症状变化'\]/);
  assert.match(page, /combinedHealthChange/);
  assert.match(route, /mergedHealthChange/);
  assert.match(route, /cleanMedicalText\(body\.symptoms, 5000\)/);
});
