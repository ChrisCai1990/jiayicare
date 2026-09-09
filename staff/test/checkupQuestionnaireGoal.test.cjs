const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')

test('AI checkup service goal is prefilled from the matching questionnaire core needs', () => {
  assert.match(source, /function buildCheckupQuestionnaireGoal/)
  assert.match(source, /String\(item\.responseId \|\| ''\) === String\(intake\?\.responseId \|\| ''\)/)
  assert.match(source, /filter\(item => item\.coreNeed\)/)
  assert.match(source, /initialBriefNote=\{showSelectTplModal === 'annual_checkup'/)
  assert.match(source, /已自动带入客户本次问卷需求，可核对、补充或修改/)
})
