import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8')

test('staff conversation shows a pending or read receipt only on staff-authored messages', () => {
  assert.match(source, /isStaff && \(/)
  assert.match(source, /✓ 已查看/)
  assert.match(source, /○ 待查看/)
  assert.match(source, /m\.readAt \? '✓ 已查看' : '○ 待查看'/)
  assert.match(source, /客户于 \$\{new Date\(m\.readAt\)\.toLocaleString\('zh-CN'\)\} 查看/)
})
