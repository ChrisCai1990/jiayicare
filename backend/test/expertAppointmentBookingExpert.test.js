const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('expert appointment keeps advisor clues separate from the clinician confirmed at booking', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../src/utils/medicalProxyWorkflow.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(routes, /appointmentOnly \? \['hospital', 'department', 'preferredDateStart', 'preferredDateEnd'\]/);
  assert.match(workflow, /期望专家\/线索：\$\{plan\.expert\}/);
  assert.match(workflow, /const actualExpert = nonempty\(task\.formData\.appointmentExpert\) \|\| '待院方确认'/);
  assert.match(workflow, /实际预约专家\/医生：\$\{actualExpert\}/);
  assert.match(workflow, /doctor: \/专家约诊\/\.test\(order\.serviceName \|\| ''\) \? \(booking\.appointmentExpert \|\| ''\)/);
});
