const test = require('node:test');
const assert = require('node:assert/strict');
const { canDirectlyApproveReport, validateOcrReviewTransition, validateManualAuditAction } = require('../src/utils/reportReviewPolicy');

test('legacy reports without OCR can still use direct manual approval', () => {
  assert.equal(canDirectlyApproveReport(undefined), true);
  assert.equal(canDirectlyApproveReport('none'), true);
});

test('raw or in-progress OCR cannot bypass the OCR review page', () => {
  assert.equal(canDirectlyApproveReport('processing'), false);
  assert.equal(canDirectlyApproveReport('pending'), false);
  assert.equal(canDirectlyApproveReport('failed'), false);
});

test('a formally reviewed OCR result is eligible for the compatible approval path', () => {
  assert.equal(canDirectlyApproveReport('reviewed'), true);
});

test('OCR publication requires an explicit submit action and idempotency key', () => {
  assert.match(validateOcrReviewTransition({ aiStatus: 'reviewed' }), /提交审核动作/);
  assert.match(validateOcrReviewTransition({ aiStatus: 'reviewed', reviewAction: 'submit' }), /请求标识/);
  assert.equal(validateOcrReviewTransition({ aiStatus: 'reviewed', reviewAction: 'submit', reviewRequestId: 'review-1' }), '');
});

test('draft and reject transitions cannot masquerade as formal publication', () => {
  assert.match(validateOcrReviewTransition({ aiStatus: 'pending', reviewAction: 'submit', reviewRequestId: 'review-1' }), /已复核/);
  assert.equal(validateOcrReviewTransition({ aiStatus: 'pending', reviewAction: 'save_draft' }), '');
  assert.equal(validateOcrReviewTransition({ aiStatus: 'none', reviewAction: 'reject', reviewRequestId: 'reject-1' }), '');
});

test('manual audit only accepts explicit approve or reject actions with request ids', () => {
  assert.match(validateManualAuditAction('anything', 'review-1'), /无效/);
  assert.match(validateManualAuditAction('approve', ''), /请求标识/);
  assert.equal(validateManualAuditAction('reject', 'reject-1'), '');
});
