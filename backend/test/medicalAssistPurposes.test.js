const test = require('node:test')
const assert = require('node:assert/strict')
const { followUpTaskPurposes } = require('../src/utils/medicalAssistRequirements')
const fs = require('node:fs')
const path = require('node:path')
const { MAX_PURPOSE_LENGTH, generateCompactMedicalAssistPurposes, isValidPurpose } = require('../src/utils/medicalAssistPurposeDraft')

test('medical assist purposes preserve explicit per-item outcomes', () => {
  const purposes = followUpTaskPurposes({ sourceHealthPlanId: { type: 'medical_assist', content: { moduleData: { tasks: { records: [
    { task: '请妇科医生开具盆腔MRI检查单' },
    { task: '预约消化内科专家完成胃肠镜复查' },
  ] } } } } })
  assert.deepEqual(purposes, ['请妇科医生开具盆腔MRI检查单', '预约消化内科专家完成胃肠镜复查'])
})

test('legacy newline tasks become separate purposes', () => {
  const purposes = followUpTaskPurposes({ sourceHealthPlanId: { type: 'medical_assist', content: { tasks: '1. 开具肾功能检查单\n2、打印并交付检查报告' } } })
  assert.deepEqual(purposes, ['开具肾功能检查单', '打印并交付检查报告'])
})

test('plan generation asks for concise verifiable purposes', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  assert.match(route, /一项只写一个可验收结果/)
  assert.match(route, /不强行凑数量/)
})

test('supervision issues reopen the paired executor task', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  assert.match(route, /taskRole === 'supervisor'.*status === 'in_progress'/)
  assert.match(route, /status: 'in_progress', serviceChecklist: followUp\.serviceChecklist/)
})

test('verbose medical assist requirements are rewritten into short verifiable purposes', async () => {
  const source = '于2026年生成方案后尽快陪同/代办至浙二医院门诊，携带身份证、医保卡、既往病历及本次就诊需求清单，协助挂号并对接医生开具针对性检查单（如：盆腔MRI、胃肠镜复查、肾错构瘤随访超声/CT、肾功能动态监测）'
  let receivedPrompt = ''
  const fakeChat = async messages => {
    receivedPrompt = messages[0].content
    return JSON.stringify({ purposes: [
      '妇科：开具盆腔MRI检查单',
      '消化内科：确认是否需胃肠镜复查并开单',
      '泌尿外科：开具肾错构瘤随访CT检查单',
      '肾内科：开具肾功能检查单',
    ] })
  }
  const purposes = await generateCompactMedicalAssistPurposes(fakeChat, source, { hospital: '浙二医院' })
  assert.equal(purposes.length, 4)
  assert.ok(purposes.every(item => item.length <= MAX_PURPOSE_LENGTH && isValidPurpose(item)))
  assert.ok(purposes.every(item => !/携带|陪同\/代办|既往病历/.test(item)))
  assert.match(receivedPrompt, /一条只对应一个结果/)
  assert.match(receivedPrompt, /不得遗漏原文明确列出的具体检查项目/)
})

test('overlong AI purpose is rejected instead of being saved', async () => {
  const fakeChat = async () => JSON.stringify({ purposes: ['请携带身份证医保卡既往病历并陪同客户前往医院挂号对接医生完成所有相关事项和后续安排'] })
  await assert.rejects(() => generateCompactMedicalAssistPurposes(fakeChat, '原始要求'), /仍不够简洁/)
})

test('draft plan exposes purpose-only regeneration without creating another plan', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8')
  assert.match(route, /regenerate-medical-assist-purposes/)
  assert.match(route, /方案已推送，不能覆盖代办目的/)
  assert.doesNotMatch(route, /plan\.status !== 'draft' \|\| plan\.pushedAt/)
})
