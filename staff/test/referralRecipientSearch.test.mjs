import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8')

test('referral recipient selector supports staff search while retaining staff ids', () => {
  assert.match(source, /placeholder="搜索姓名、角色或职称"/)
  assert.match(source, /staff\.name, staff\.role, staff\.roleLabel, ROLE_LABEL_MAP\[staff\.role\], staff\.title/)
  assert.match(source, /toStaffId: staff\._id/)
  assert.match(source, /未找到匹配的医护人员/)
})
