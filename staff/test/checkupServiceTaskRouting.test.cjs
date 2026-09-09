const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/components/ServiceTasksPanel.jsx'), 'utf8')

test('health advisor checkup task opens AI checkup design instead of the transaction dialog or service overview', () => {
  assert.match(source, /task\.assignedTo\?\.role === 'familyDoctor'/)
  assert.match(source, /serviceDomain === 'annual_checkup'/)
  assert.match(source, /openAiCheckupDesign: true/)
  assert.match(source, /serviceView=checkup/)
})

test('other service tasks keep the existing follow-up transaction route', () => {
  assert.match(source, /nav\(`\/patients\/\$\{task\.patientId\?\._id\}\?tab=followups`/)
  assert.match(source, /openFollowUp: task/)
})
