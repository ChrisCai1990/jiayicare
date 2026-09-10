const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')

test('newly generated checkup plan opens immediately instead of getting lost in the overview', () => {
  assert.match(source, /const generated = await staffAPI\.generateAIAnnualCheckupPlan/)
  assert.match(source, /nav\(`\/plans\/\$\{generated\.data\._id\}`/)
  assert.match(source, /正在打开方案/)
  assert.match(source, /returnTo: `\/patients\/\$\{id\}\?tab=plans&serviceView=checkup`/)
})
