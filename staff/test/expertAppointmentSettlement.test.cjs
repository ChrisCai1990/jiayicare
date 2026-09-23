const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8')

test('expert appointment asks for settlement only when commercial insurance is selected', () => {
  assert.match(source, /insuranceUse === 'commercial_insurance' && <label[^>]*>商保结算方式 \*/)
  assert.match(source, /insuranceUse === 'commercial_insurance' && settlementMethod === 'pending'/)
  assert.match(source, /if \(e\.target\.value !== 'commercial_insurance'\) setSettlementMethod\('pending'\)/)
})

test('handoff omits settlement for self-pay and medical insurance', () => {
  assert.match(source, /`费用与保险：\$\{\(\{ self_pay: '自费', medical_insurance: '医保', commercial_insurance: '商保' \}\)\[insuranceUse\]\}`/)
  assert.match(source, /insuranceUse === 'commercial_insurance' && `结算方式：/)
  assert.doesNotMatch(source, /`支付方式：\$\{\(\{ direct:/)
})
