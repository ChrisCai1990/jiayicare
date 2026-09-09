import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/NewPatientPage.jsx', import.meta.url), 'utf8')

test('new patient form supports passport identity entry', () => {
  assert.match(source, /idType:\s*'idCard'/)
  assert.match(source, /<option value="passport">护照<\/option>/)
  assert.match(source, /form\.idType !== 'passport'/)
  assert.match(source, /idType:\s*e\.target\.value/)
})

test('new patient form can assign and submit a health planner', () => {
  assert.match(source, /assignedHealthPlanner:\s*''/)
  assert.match(source, /assignedHealthPlanner:\s*form\.assignedHealthPlanner\s*\|\| undefined/)
  assert.match(source, /healthPlanners\s*=\s*staffList\.filter\(s => s\.role === 'healthPlanner'\)/)
  assert.match(source, /label="健康规划师"[\s\S]*?value=\{form\.assignedHealthPlanner\}/)
})
