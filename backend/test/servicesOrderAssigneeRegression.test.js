const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('services order route defines its workflow assignee resolver', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  const definition = source.indexOf('async function resolveOrderWorkflowAssignee');
  const invocation = source.indexOf('await resolveOrderWorkflowAssignee');
  assert.ok(definition >= 0, 'resolver definition is missing');
  assert.ok(invocation > definition, 'resolver must be defined before the order route invokes it');
});
