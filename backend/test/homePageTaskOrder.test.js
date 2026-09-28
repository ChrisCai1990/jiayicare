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

test('workbench labels distinguish service execution from AI review', () => {
  const serviceTasks = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTasksPanel.jsx'), 'utf8')
  assert.match(serviceTasks, /服务流程任务（执行\/督办）/)
  assert.match(serviceTasks, /与下方 AI 审核任务不是同一项/)
  assert.match(aiTodos, /AI 生成内容或 AI 触发提醒的人工核对/)
  assert.match(aiTodos, /会转入上方服务流程/)
})

test('report follow-up draft review is shown only in the AI review queue', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  const serviceTasks = route.slice(route.indexOf("router.get('/service-tasks'"), route.indexOf('// ── GET /api/staff/patients'))
  const aiTodosRoute = route.slice(route.indexOf("router.get('/ai-todos'"), route.indexOf("router.patch('/service-proposals"))
  assert.match(serviceTasks, /task\.workflowKey !== 'report_followup:advisor_review'/)
  assert.match(aiTodosRoute, /type: 'report_followup_review'/)
  assert.match(aiTodosRoute, /报告随访草稿待审核/)
  assert.match(aiTodos, /report_followup_review/)
})

test('prescription review does not create a duplicate health-course review, while clinical drafts appear in AI todos', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  const patientDetail = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8')
  assert.match(route, /HEALTH_COURSE_DOCUMENTS = new Set\(\['outpatient_record', 'inpatient_record', 'exam_report', 'lab_report'\]\)/)
  assert.match(route, /documentCategory: \{ \$ne: 'prescription_order' \}/)
  assert.match(route, /type: 'health_course_review'/)
  assert.match(aiTodos, /health_course_review/)
  assert.doesNotMatch(patientDetail.match(/const HEALTH_COURSE_DOCUMENT_CATEGORIES[^\n]+/)[0], /prescription_order/)
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
  const { staffTasks } = require('./helpers/taskVisibility')
  const rows = ['executor', 'supervisor'].map(taskRole => ({ sourceType: 'insurance_service', taskRole }))
  rows.push({ sourceType: 'scheduled', tags: ['保险服务'] })
  assert.equal(staffTasks(rows).length, 3)
  assert.equal(staffTasks([{ sourceType: 'insurance_service' }, { sourceType: 'scheduled', tags: [] }]).length, 0)
})

test('executor checklist uploads check orders per purpose for supervisor review', () => {
  const checklist = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTaskChecklist.jsx'), 'utf8')
  assert.match(checklist, /上传对应检查单/)
  assert.match(checklist, /item\.attachments/)
  assert.match(checklist, /mode === 'supervisor'/)
})

test('private check-order attachments are signed whenever service tasks are read', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  assert.match(route, /function withSignedServiceChecklist/)
  assert.match(route, /signStoredUrl\(file\?\.url \|\| '', file\?\.ossKey \|\| ''\)/)
  assert.match(route, /const item = withSignedServiceChecklist\(task\)/)
  assert.match(route, /withSignedServiceChecklist\(followUp\)/)
})

test('check-order attachments open in an in-page preview with download as a secondary action', () => {
  const checklist = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTaskChecklist.jsx'), 'utf8')
  assert.match(checklist, /查看：\{file\.name/)
  assert.match(checklist, /role="dialog"/)
  assert.match(checklist, /<img src=\{fileUrl\(preview\.previewUrl \|\| preview\.url\)\}/)
  assert.match(checklist, /<iframe title=\{preview\.name/)
  assert.match(checklist, /下载原文件/)
})

test('supervisor copy clearly separates order acceptance from later report collection', () => {
  const checklist = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ServiceTaskChecklist.jsx'), 'utf8')
  assert.match(checklist, /本次任务：核对代办结果与检查单/)
  assert.match(checklist, /本任务不收集检查结果或体检报告/)
  assert.match(checklist, /退回就医专员补充/)
})
