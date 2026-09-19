const test = require('node:test');
const assert = require('node:assert/strict');
const { routingFor, currentReviewer, isAssignedPhaseReviewer, reviewQueueFilter } = require('../src/utils/phaseAssessmentRouting');
const { nextAssessmentStatus } = require('../src/utils/phaseAssessment');
const { eligibleForAutomaticAssessment } = require('../src/utils/phaseAssessmentScheduler');

test('阶段评估按领域进入顾问、营养、运动、药食同源审核', () => {
  for (const [domain, role, status] of [['comprehensive', 'familyDoctor', 'doctor_review'], ['nutrition', 'nutritionist', 'nutrition_review'], ['exercise', 'rehabSpecialist', 'professional_review'], ['tcm', 'tcmDoctor', 'professional_review']]) {
    assert.deepEqual(routingFor(domain), { assessmentDomain: domain, primaryReviewRole: role, status });
  }
  assert.equal(routingFor('comprehensive', 'intensive_nutrition').primaryReviewRole, 'nutritionist');
  assert.throws(() => routingFor('invalid'));
});
test('旧营养记录保留审核岗位，完成记录退出待办', () => {
  assert.equal(currentReviewer({ status: 'pending' }), 'nutritionist');
  assert.equal(currentReviewer({ status: 'rejected' }), 'nutritionist');
  assert.equal(currentReviewer({ status: 'finalized' }), null);
  assert.equal(currentReviewer({ primaryReviewRole: 'tcmDoctor', status: 'doctor_review' }), 'familyDoctor');
});
test('对应专业审核、风险升级和退回形成同一条流转', () => {
  const primaryReviewRole = 'rehabSpecialist';
  assert.equal(nextAssessmentStatus({ currentStatus: 'professional_review', actorRole: primaryReviewRole, primaryReviewRole, action: 'approve' }), 'finalized');
  assert.equal(nextAssessmentStatus({ currentStatus: 'professional_review', actorRole: primaryReviewRole, primaryReviewRole, action: 'approve', clinicalRequired: true }), 'doctor_review');
  assert.equal(nextAssessmentStatus({ currentStatus: 'doctor_review', actorRole: 'familyDoctor', primaryReviewRole, action: 'return' }), 'professional_review');
  assert.equal(nextAssessmentStatus({ currentStatus: 'professional_review', actorRole: 'nutritionist', primaryReviewRole, action: 'approve' }), null);
  assert.equal(nextAssessmentStatus({ currentStatus: 'nutrition_review', actorRole: 'nutritionist', action: 'invalid', clinicalRequired: true }), null);
});
test('综合顾问直接审核，退回不交营养师', () => {
  assert.equal(nextAssessmentStatus({ currentStatus: 'doctor_review', actorRole: 'familyDoctor', primaryReviewRole: 'familyDoctor', action: 'return' }), 'rejected');
  assert.equal(currentReviewer({ status: 'rejected', primaryReviewRole: 'familyDoctor' }), 'familyDoctor');
  assert.deepEqual(reviewQueueFilter('familyDoctor').$or[1], { status: 'rejected', primaryReviewRole: 'familyDoctor' });
  assert.equal(reviewQueueFilter('tcmDoctor').$or[0].primaryReviewRole, 'tcmDoctor');
});
test('归档待办保留在最终审核岗位而不是固定原初审岗位', () => {
  assert.equal(currentReviewer({ status: 'archive_pending', primaryReviewRole: 'rehabSpecialist', finalReviewRole: 'familyDoctor' }), 'familyDoctor');
  assert.ok(reviewQueueFilter('superadmin').status.$in.includes('archive_pending'));
  for (const role of ['familyDoctor', 'nutritionist', 'rehabSpecialist', 'tcmDoctor']) {
    assert.ok(reviewQueueFilter(role).$or.some(filter => filter.status === 'archive_pending' && filter.finalReviewRole === role));
  }
});
test('工作台与审核必须匹配实际客户归属及岗位', () => {
  const user = { assignedRehabSpecialist: 'a' };
  assert.equal(isAssignedPhaseReviewer(user, { _id: 'a', role: 'rehabSpecialist' }, 'rehabSpecialist'), true);
  assert.equal(isAssignedPhaseReviewer(user, { _id: 'b', role: 'rehabSpecialist' }, 'rehabSpecialist'), false);
  assert.equal(isAssignedPhaseReviewer(user, { _id: 'a', role: 'nutritionist' }, 'rehabSpecialist'), false);
});
test('自动扫描仅允许有效服务期内的试点客户，当日到期仍有效', () => {
  const now = new Date('2026-09-19T12:00:00+08:00');
  const user = { aiPilotFeatures: { stageAssessment: true }, serviceExpiry: '2026-09-19' };
  assert.equal(eligibleForAutomaticAssessment(user, now), true);
  for (const serviceExpiry of ['', 'invalid', '2026-09-18']) assert.equal(eligibleForAutomaticAssessment({ ...user, serviceExpiry }, now), false);
  assert.equal(eligibleForAutomaticAssessment({ ...user, aiPilotFeatures: {} }, now), false);
});
