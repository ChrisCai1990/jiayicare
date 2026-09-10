const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const flow = fs.readFileSync(path.join(__dirname, '../src/utils/checkupOneStopFlow.js'), 'utf8')
const userRoute = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8')
const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')

test('customer confirmation completes doctor work and activates booking', () => {
  assert.match(userRoute, /onCustomerConfirmedCheckupPlan\(plan\.patientId\)/)
  assert.match(flow, /executedContent: '体检方案已由客户确认'/)
  assert.match(flow, /tasks\.booking.*isBlocked: false/s)
})

test('booking and onsite completion advance one role at a time', () => {
  assert.match(staffRoute, /advanceCheckupTask\(followUp\)/)
  assert.match(flow, /executorRole === 'healthPlanner'.*tasks\.onsite/s)
  assert.match(flow, /appointmentDetails/)
  assert.match(flow, /serviceChecklist: \(followUp\.serviceChecklist/)
  assert.match(flow, /handoffSummary: item\.executionResult/)
  assert.match(flow, /plannedContent: followUp\.executedContent/)
  assert.match(flow, /executorRole === 'medicalAssistant'.*tasks\.report_collection/s)
  assert.match(flow, /result\.report_collection.*dependsOnTaskId: result\.onsite\._id/s)
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
  assert.match(flow, /addBusinessDays\(serviceDate, 7\)/)
  assert.match(flow, /!\[0, 6\]\.includes\(date\.getDay\(\)\)/)
})

test('single-service order closes only after every checkup executor task is finished', () => {
  assert.match(flow, /executorRole === 'healthManager'.*报告/s)
  assert.match(flow, /status: \{ \$nin: \['completed', 'cancelled'\] \}/)
  assert.match(flow, /remaining === 0/)
  assert.match(flow, /totalUnits: \{ \$lte: 1 \}/)
  assert.match(flow, /tradeStatus: 'completed'/)
})

test('report collection cannot complete without a real patient report', () => {
  assert.match(staffRoute, /isCheckupReportCollection/)
  assert.match(staffRoute, /MedicalReport\.countDocuments\(\{ _id: \{ \$in: reportIds \}, user: followUp\.patientId \}\)/)
  assert.match(staffRoute, /closure\?\.serviceReviewed/)
  assert.match(staffRoute, /closure\?\.collectionStatus !== 'complete'/)
})
