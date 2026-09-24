const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('manager can record a confirmed date change without ending the upload task', () => {
  const form = fs.readFileSync(path.join(__dirname, '../src/components/ExpertAppointmentRescheduleForm.jsx'), 'utf8')
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')
  assert.match(form, /rescheduleExpertAppointment\(task\._id/)
  assert.match(form, /客户已确认新时间/)
  assert.match(form, /医院已确认新预约/)
  assert.match(page, /medicalProxyStage\(execItem\) === 'post_visit_audit' && \/专家约诊\//)
})
