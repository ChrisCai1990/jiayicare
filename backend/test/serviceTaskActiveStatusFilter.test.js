const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')

test('service task active states are filtered after the stable ownership query', () => {
  const route = source.match(/router\.get\('\/service-tasks'[\s\S]*?res\.json\(\{ success: true, data: tasks\.map/)
  assert.ok(route, 'service-tasks route should exist')
  assert.match(route[0], /if \(status && status !== 'active'\) filter\.status = status/)
  assert.match(route[0], /queriedTasks\.filter\(task => \['planned', 'in_progress', 'missed'\]\.includes\(task\.status\)\)/)
  assert.doesNotMatch(route[0], /status.*\$in.*planned.*in_progress.*missed/)
})
