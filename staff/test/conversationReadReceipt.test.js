import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8')

test('staff conversation shows a read receipt only on staff-authored messages', () => {
  assert.match(source, /isStaff && m\.readAt/)
  assert.match(source, /✓ 已查看/)
  assert.match(source, /客户于 \$\{new Date\(m\.readAt\)\.toLocaleString\('zh-CN'\)\} 查看/)
})
