const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('service workbench groups workflow tasks into one current-stage card', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/ServiceTasksPanel.jsx'), 'utf8');
  assert.match(source, /task\.coordinationGroupId \|\| `task:\$\{task\._id\}`/);
  assert.match(source, /sequenceByKey/);
  assert.match(source, /return \{ \.\.\.service, task: service\.tasks\[0\], totalSteps:/);
  assert.match(source, /当前环节 · 共\{service\.totalSteps\}环节/);
  assert.match(source, /\{serviceGroups\.length\}/);
  assert.doesNotMatch(source, /visibleItems\.slice/);
});
