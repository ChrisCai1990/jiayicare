const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('转介只向无归属接收方返回有限授权信息', () => {
  const route = read('backend/src/routes/staff.js');
  assert.match(route, /item\.canViewPatient = canViewPatient/);
  assert.match(route, /phone: canViewPatient \? patient\.phone : ''/);
  assert.match(route, /发起方授权的专病摘要/);
  assert.doesNotMatch(route.slice(route.indexOf("router.post('/referrals/:id/ai-response-draft"), route.indexOf("router.patch('/referrals/:id'")), /Medication\.find/);
});

test('转介反馈经人工审核后才写入专病健康变化时间轴', () => {
  const model = read('backend/src/models/Referral.js');
  const route = read('backend/src/routes/staff.js');
  assert.match(model, /courseDraftStatus/);
  assert.match(route, /course-draft\/review/);
  assert.match(route, /仅发起方、健康顾问或超级管理员可审核病程草稿/);
  assert.match(route, /disease\.courseEntries = \[entry/);
  assert.match(route, /诊断、检查、治疗或用药信息只能作为外部医疗机构信息归档/);
  assert.match(route, /请填写来源医疗机构/);
});

test('前端区分完整档案权限并展示专病关联与结构化协作反馈', () => {
  const notifications = read('staff/src/pages/NotificationsPage.jsx');
  const patient = read('staff/src/pages/PatientDetailPage.jsx');
  assert.match(notifications, /有限授权视图/);
  assert.match(notifications, /r\.canViewPatient && nav/);
  assert.match(notifications, /内部专业协作反馈/);
  assert.match(notifications, /外部医疗机构信息归档/);
  assert.match(patient, /审核通过并写入时间轴/);
});

test('转介通知进入首页消息总数且附件明确药物状态与后续健康变化', () => {
  const route = read('backend/src/routes/staff.js');
  const home = read('staff/src/pages/HomePage.jsx');
  const notifications = read('staff/src/pages/NotificationsPage.jsx');
  const patient = read('staff/src/pages/PatientDetailPage.jsx');
  assert.match(home, /pendingReferralCount/);
  assert.match(home, /unreadRepliedCount/);
  assert.match(home, /nav\('\/notifications'\)/);
  assert.match(route, /recentCourseEntries/);
  assert.match(route, /\.slice\(0, 10\)/);
  assert.match(patient, /用药记录（含状态与时间）/);
  assert.match(patient, /结束或停用时间/);
  assert.match(notifications, /首次健康信息摘要/);
  assert.match(notifications, /后续健康变化与医疗机构诊疗归档/);
  assert.match(notifications, /主诉／主要健康诉求/);
});

test('AI只整理授权信息且不生成诊疗决策', () => {
  const route = read('backend/src/routes/staff.js');
  assert.match(route, /不得扮演医师，不得新增诊断、治疗、检查或用药建议/);
  assert.match(route, /信息整理/);
  assert.match(route, /协作反馈/);
});

test('被退回的转介可由原发起方修订后重新发送并保留历史', () => {
  const model = read('backend/src/models/Referral.js');
  const route = read('backend/src/routes/staff.js');
  const notifications = read('staff/src/pages/NotificationsPage.jsx');
  const api = read('staff/src/api.js');
  assert.match(model, /revisionHistory/);
  assert.match(route, /referrals\/:id\/resubmit/);
  assert.match(route, /仅已退回的转介可以编辑后重新发送/);
  assert.match(route, /referral\.revisionHistory\.push/);
  assert.match(route, /referral\.status = 'pending'/);
  assert.match(api, /resubmitReferral/);
  assert.match(notifications, /编辑并重新发送/);
  assert.match(notifications, /保存并重新发送/);
  assert.match(notifications, /原退回意见和本次修订会保留/);
});
