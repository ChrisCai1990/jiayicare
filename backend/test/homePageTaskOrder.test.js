const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const homePage = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/HomePage.jsx'), 'utf8')
const aiTodos = fs.readFileSync(path.join(__dirname, '../../staff/src/components/AiTodosPanel.jsx'), 'utf8')

test('temporary service tasks stay above AI review tasks', () => {
  assert.ok(homePage.indexOf('<ServiceTasksPanel />') < homePage.indexOf('<AiTodosPanel />'))
})

test('AI task panel keeps review-specific wording', () => {
  assert.match(aiTodos, /AI 待审核任务/)
  assert.match(aiTodos, /仅显示本人可审核项/)
  assert.match(aiTodos, /暂无待审核任务/)
})

test('follow-up counters and list exclude service executor, supervisor and insurance work items', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  const reports = route.slice(route.indexOf("router.get('/reports'"), route.indexOf("router.get('/staff-list'"))
  const followUps = route.slice(route.indexOf("router.get('/followups'"), route.indexOf("router.post('/followups'"))
  assert.match(reports, /fixedFollowUpOnlyFilter/)
  assert.match(reports, /taskRole: \{ \$exists: false \}/)
  assert.match(reports, /tags: \{ \$nin: \['保险服务'\] \}/)
  assert.match(followUps, /taskRole: \{ \$exists: false \}/)
  assert.match(followUps, /sourceType: \{ \$ne: 'insurance_service' \}/)
  assert.match(followUps, /tags: \{ \$nin: \['保险服务'\] \}/)
})

test('insurance work is returned by the temporary service task endpoint', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  const serviceTasks = route.slice(route.indexOf("router.get('/service-tasks'"), route.indexOf('// ── GET /api/staff/patients'))
  assert.match(serviceTasks, /sourceType: 'insurance_service'/)
  assert.match(serviceTasks, /sourceType: 'scheduled', tags: '保险服务'/)
})

test('executor checklist uploads check orders per purpose for supervisor review', () => {
  const checklist = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTaskChecklist.jsx'), 'utf8')
  assert.match(checklist, /上传对应检查单/)
  assert.match(checklist, /item\.attachments/)
  assert.match(checklist, /mode === 'supervisor'/)
})
