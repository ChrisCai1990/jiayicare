const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')

test('checkup workbench entry immediately opens AI checkup plan design', () => {
  assert.match(source, /location\.state\?\.openAiCheckupDesign/)
  assert.match(source, /setServiceManagementView\('checkup'\)/)
  assert.match(source, /setShowSelectTplModal\('annual_checkup'\)/)
})
