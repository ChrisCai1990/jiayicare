import test from 'node:test'
import assert from 'node:assert/strict'
import { specialtyIssueSuggestions } from './specialtyIssueSuggestion.mjs'

test('specific findings prefill editable specialty issue names', () => {
  assert.deepEqual(specialtyIssueSuggestions('胸部CT：双肺多发结节，建议复查'), ['肺结节'])
  assert.deepEqual(specialtyIssueSuggestions('慢性非萎缩性胃炎伴糜烂；胃息肉'), ['慢性非萎缩性胃炎伴糜烂', '胃息肉'])
  assert.deepEqual(specialtyIssueSuggestions('胸部CT：未见肺结节'), [])
  assert.deepEqual(specialtyIssueSuggestions('右肝偏高回声结节（2.80×1.98cm），边界清晰'), ['肝内结节'])
  assert.deepEqual(specialtyIssueSuggestions('血常规检查'), [])
})
