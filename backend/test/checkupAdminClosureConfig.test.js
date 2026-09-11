const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('Admin can define stable workflow stages, event gates and closing behavior', () => {
  const model = read('src/models/FollowUpPlan.js')
  const route = read('src/routes/settings.js')
  const page = read('../admin/src/pages/projects/FollowUpPlanPage.jsx')
  for (const field of ['workflowStageKey', 'workflowTaskRole', 'activationEvent', 'closesService']) {
    assert.match(model, new RegExp(field))
    assert.match(route, new RegExp(field))
    assert.match(page, new RegExp(field))
  }
  assert.match(page, /报告完成解析并审核/)
  assert.match(page, /完成后关闭服务与单次订单/)
})

test('V12 migration upgrades active checkup services and their order snapshots', () => {
  const migration = read('src/scripts/migrateCheckupSupervisionClosureV12.js')
  assert.match(migration, /maintenance_backups/)
  assert.match(migration, /serviceWorkflowSnapshot: workflowSnapshot/)
  assert.match(migration, /ensureCheckupTasks/)
  assert.match(migration, /onCheckupReportAudited/)
})
