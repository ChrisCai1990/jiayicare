const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('expert appointment keeps advisor clues separate from the clinician confirmed at booking', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(routes, /appointmentOnly \? \['hospital', 'department', 'preferredDateStart', 'preferredDateEnd'\]/);
  assert.match(workflow, /期望专家\/线索：\$\{plan\.expert\}/);
  assert.match(workflow, /slots\.map\(\(row, index\) => `预约\$\{index \+ 1\}/);
  assert.match(workflow, /row\.expert \|\| '专家待院方确认'/);
  assert.match(workflow, /doctor: \/专家约诊\/\.test\(order\.serviceName \|\| ''\) \? \(booking\.appointmentExpert \|\| ''\)/);
});

test('confirmed appointment reschedule preserves one order and refreshes task, reminders and customer notice', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const scheduler = fs.readFileSync(path.join(__dirname, '../src/utils/appointmentReminderScheduler.js'), 'utf8');
  assert.match(routes, /followups\/:id\/expert-appointment\/reschedule/);
  assert.match(routes, /workflowKey: 'medical_proxy:post_visit_audit', assignedTo: req\.staff\._id/);
  assert.match(routes, /'medicalProxyPlan\.bookingChanges': change/);
  assert.match(routes, /'formData\.appointmentAt': latestAt/);
  assert.match(routes, /scheduleExpertAppointmentReminders\(\{ order: updated, appointmentDate: new Date\(`\$\{row\.appointmentDate\}T\$\{row\.appointmentTime\}:00\+08:00`\), appointmentText, slotIndex: index \}\)/);
  assert.match(routes, /title: '专家预约改期通知'/);
  assert.match(scheduler, /currentAppointments\.includes\(new Date\(reminder\.appointmentAt\)\.getTime\(\)\)/);
});
