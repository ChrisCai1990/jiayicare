const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('service workbench groups workflow tasks into one current-stage card', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/ServiceTasksPanel.jsx'), 'utf8');
  assert.match(source, /serviceTaskGroupKey\(task\)/);
  assert.match(source, /sequenceByKey/);
  assert.match(source, /task: proxyAction \|\| supervisor \|\| service\.tasks\[0\]/);
  assert.match(source, /当前环节 · 共\{service\.totalSteps\}环节/);
  assert.match(source, /\{serviceGroups\.length\}/);
  assert.doesNotMatch(source, /前序：/);
  assert.doesNotMatch(source, /visibleItems\.slice/);
});
