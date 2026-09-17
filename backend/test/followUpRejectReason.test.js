const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('follow-up rejection requires and persists a reason', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = route.indexOf("router.patch('/followups/:id/review'");
  const section = route.slice(start, route.indexOf("const EDITABLE", start));
  assert.match(section, /if \(!rejectReason\) return res\.status\(400\).*请填写驳回原因/);
  assert.match(section, /followUp\.cancelReason = rejectReason/);
  assert.match(section, /reviewRejectReason: rejectReason/);
});

test('staff review entry points collect a rejection reason', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const modal = fs.readFileSync(path.join(__dirname, '../../staff/src/components/CheckupAdvisorReviewModal.jsx'), 'utf8');
  assert.ok((page.match(/window\.prompt\('请填写驳回原因/g) || []).length >= 2);
  assert.match(page, /rejectReason: rejectReason\.trim\(\)/);
  assert.match(modal, /action === 'reject' && !returnNote\.trim\(\)/);
  assert.match(modal, /退回说明（退回时必填）/);
});
