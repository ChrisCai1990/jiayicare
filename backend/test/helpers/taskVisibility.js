// Execute the actual route filters with in-memory rows, no database or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const read = name => fs.readFileSync(path.join(__dirname, '../../src/routes', name + '.js'), 'utf8');
function staffTasks(rows, options = {}) {
  const source = read('staff');
  const route = source.slice(source.indexOf("router.get('/service-tasks'"));
  const start = route.indexOf('const tasks = queriedTasks.filter(');
  const end = route.indexOf('.slice(0, requestedLimit);', start);
  assert.ok(start >= 0 && end > start);
  const assignment = route.match(/const filter = (\{ assignedTo:[^\n]+);/);
  assert.ok(assignment, 'must capture actual assignee query');
  const now = new Date('2026-09-22T00:00:00Z');
  const query = vm.runInNewContext('(' + assignment[1] + ')', { req: { staff: { _id: 'owner' } }, staffId: 'owner' });
  const queriedTasks = rows.map(row => ({ assignedTo: 'owner', status: 'planned', ...row })).filter(sift(JSON.parse(JSON.stringify(query))));
  return vm.runInNewContext(route.slice(start, end + '.slice(0, requestedLimit);'.length) + '\ntasks', {
    require: require('node:module').createRequire(path.join(__dirname, '../../src/routes/staff.js')),
    queriedTasks, activeProxyOrderIds: new Set(['active-order']), now, status: 'active', includeFuture: '', requestedLimit: 100, ...options,
  });
}
function customerFilter() {
  const source = read('user');
  const route = source.slice(source.indexOf("router.get('/followup-tasks'"));
  const start = route.indexOf('FollowUp.find(') + 'FollowUp.find('.length;
  const end = route.indexOf('\n    })', start);
  assert.ok(start >= 'FollowUp.find('.length && end > start);
  return structuredClone(vm.runInNewContext('(' + route.slice(start, end + 6) + ')', { req: { user: { _id: 'patient' } } }));
}
module.exports = { staffTasks, customerFilter };
