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

test('专病档案支持删除且保留并解除关联管理服务', () => {
  const route = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  const api = read('staff/src/api.js');
  assert.match(route, /router\.delete\('\/patients\/:id\/disease-records\/:recordId'/);
  assert.match(route, /\$pull:\s*\{ diseaseRecords/);
  assert.match(route, /ServiceRecord\.updateMany/);
  assert.match(page, /删除专病档案/);
  assert.match(page, /管理服务将保留但解除专病归属/);
  assert.match(api, /deleteDiseaseRecord/);
  assert.match(api, /removeDiseaseGroup/);
  assert.match(route, /disease-record-by-name/);
  assert.match(page, /移除专病分组/);
});

test('健康变化支持修订并保留录入和修改审计信息', () => {
  const route = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  assert.match(route, /course-entries\/:entryId/);
  assert.match(route, /recordedAt: previous\.recordedAt/);
  assert.match(route, /updatedByName: operator/);
  assert.match(route, /revisionHistory/);
  assert.match(page, /录入：/);
  assert.match(page, /修改：/);
  assert.match(page, /openCourseEditor/);
});

test('医疗资料由AI提取为待审核健康变化且健康顾问确认后才入档', () => {
  const model = read('backend/src/models/MedicalReport.js');
  const route = read('backend/src/routes/staff.js');
  const page = read('staff/src/pages/PatientDetailPage.jsx');
  const api = read('staff/src/api.js');
  assert.match(model, /healthCourseDraft/);
  assert.match(route, /health-course-draft/);
  assert.match(route, /status:'pending_review'/);
  assert.match(route, /只能忠实提取输入材料已有事实，不诊断、不推断、不提供治疗建议/);
  assert.match(route, /\['familyDoctor','superadmin'\]/);
  assert.match(route, /sourceReportId:report\._id/);
  assert.match(route, /reviewedByName/);
  assert.match(api, /generateHealthCourseDraft/);
  assert.match(api, /reviewHealthCourseDraft/);
  for (const text of ['AI提取健康变化', '审核健康变化', '查看原始资料', '确认并写入健康变化', '不入档']) assert.match(page, new RegExp(text));
});
