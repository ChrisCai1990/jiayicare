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

test('Admin templates support multiple client brands and expose the checkup questionnaire', () => {
  const model = read('src/models/PlanTemplate.js')
  const route = read('src/routes/admin.js')
  const page = read('../admin/src/pages/HealthPlanTemplatePage.jsx')
  assert.match(model, /clientBrands/)
  assert.match(route, /Array\.isArray\(req\.body\.clientBrands\)/)
  assert.match(page, /适用客户归属/)
  assert.match(page, /下单自动体检问卷/)
  assert.match(page, /updateProductServiceWorkflow/)
})

test('V14 consolidates duplicate checkup templates with a recoverable backup', () => {
  const migration = read('src/scripts/consolidateCheckupTemplatesV14.js')
  assert.match(migration, /maintenance_backups/)
  assert.match(migration, /clientBrands: \['jiayiguanjia', 'jinyisen'\]/)
  assert.match(migration, /healthplans/)
  assert.match(migration, /deleteMany/)
  assert.match(migration, /skipped: 'template_not_found'/)
})

test('V18 consolidates every duplicate active medical-assist template and deployment runs it once', () => {
  const migration = read('src/scripts/consolidateMedicalAssistTemplatesV18.js')
  const admin = read('src/routes/admin.js')
  const deploy = read('../scripts/deploy.py')
  assert.match(migration, /maintenance_backups/)
  assert.match(migration, /db\.collection\('healthplans'\)\.updateMany/)
  assert.match(migration, /deleteMany/)
  assert.match(migration, /clientBrands: brands/)
  assert.match(admin, /同类型下已存在同名启用模板/)
  assert.match(deploy, /consolidateMedicalAssistTemplatesV18\.js --apply/)
  assert.match(deploy, /\.medical-assist-template-consolidation-v18-applied/)
})

test('V15 aligns customer intake and adds an outpatient final acceptance gate', () => {
  const migration = read('src/scripts/migrateOneStopFinalFlowV15.js')
  const outpatient = read('src/scripts/migrateOutpatientOneStopWorkflowV5.js')
  const deploy = read('../scripts/deploy.py')
  assert.match(migration, /用户先填写健康文件/)
  assert.match(outpatient, /总督办与最终验收/)
  assert.match(migration, /maintenance_backups/)
  assert.match(migration, /finalTasks/)
  assert.match(deploy, /migrateOneStopFinalFlowV15\.js --apply/)
})
