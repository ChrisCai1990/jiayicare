const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const flow = fs.readFileSync(path.join(__dirname, '../src/utils/checkupOneStopFlow.js'), 'utf8')
const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8')
const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')

test('customer confirmation completes doctor work and activates booking', () => {
  assert.match(userRoute, /onCustomerConfirmedCheckupPlan\(plan\)/)
  assert.match(flow, /planOrPatientId\?\.content\?\.serviceInstanceId/)
  assert.match(flow, /executedContent: '体检方案已由客户确认'/)
  assert.match(flow, /tasks\.booking.*isBlocked: false/s)
})

test('booking and onsite completion advance one role at a time', () => {
  assert.match(staffRoute, /advanceCheckupTask\(followUp\)/)
  assert.match(flow, /stage === 'booking'.*tasks\.onsite/s)
  assert.match(flow, /appointmentDetails/)
  assert.match(flow, /serviceChecklist: \(followUp\.serviceChecklist/)
  assert.match(flow, /handoffSummary: item\.executionResult/)
  assert.match(flow, /plannedContent: followUp\.executedContent/)
  assert.match(flow, /stage === 'onsite'.*tasks\.report_collection/s)
  assert.match(flow, /'plan_design', 'booking', 'onsite', 'report_collection', 'result_review', 'final_acceptance'/)
})

test('legacy downstream tasks remain blocked until their predecessor completes', () => {
  assert.match(flow, /tasks\.onsite && !bookingCompleted[\s\S]*isBlocked: true[\s\S]*activationEvent: 'booking_completed'/)
  assert.match(flow, /tasks\.report_collection && !onsiteCompleted[\s\S]*isBlocked: true[\s\S]*activationEvent: 'onsite_completed'/)
})

test('serial task can only return to its direct predecessor with a reason', () => {
  assert.match(staffRoute, /followups\/:id\/return-previous/)
  assert.match(staffRoute, /退回上一环节必须填写原因/)
  assert.match(staffRoute, /_id: current\.dependsOnTaskId/)
  assert.match(staffRoute, /current\.isBlocked = true/)
  assert.match(staffRoute, /previous\.status = 'in_progress'/)
  assert.match(staffRoute, /returnHistory/)
})

test('report collection is scheduled seven business days after checkup', () => {
  assert.match(flow, /addBusinessDays\(serviceDate, Number\(scheme\.executorDueOffsetDays \?\? 7\)\)/)
  assert.match(flow, /!\[0, 6\]\.includes\(date\.getDay\(\)\)/)
})

test('report audit unlocks doctor review and only final supervisor acceptance closes the order', () => {
  assert.match(staffRoute, /onCheckupReportAudited\(report\)/)
  assert.match(flow, /stage === 'report_collection'/)
  assert.match(flow, /stage === 'result_review'.*tasks\.final_acceptance/s)
  assert.match(flow, /stage === 'final_acceptance'.*closeCheckupService/s)
  assert.match(flow, /totalUnits: \{ \$lte: 1 \}/)
  assert.match(flow, /tradeStatus: 'completed'/)
})

test('report collection cannot complete without a real patient report', () => {
  assert.match(staffRoute, /isCheckupReportCollection/)
  assert.match(staffRoute, /MedicalReport\.countDocuments\(\{ _id: \{ \$in: reportIds \}, user: followUp\.patientId \}\)/)
  assert.match(staffRoute, /closure\?\.serviceReviewed/)
  assert.match(staffRoute, /closure\?\.collectionStatus !== 'complete'/)
})
