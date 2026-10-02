import test from 'node:test'
import assert from 'node:assert/strict'
import { nutritionAssessmentPrefill } from '../src/utils/nutritionAssessmentPrefill.mjs'

test('已有营养评估可带入文本和逐项指标，但不沿用旧复盘日期或安全确认', () => {
  const patient = { height: 156, weight: 51, healthProfile: { foodAllergy: '花生' } }
  const previous = { goal: '改善饮食', height: 155, weight: 53, currentDiet: '早餐鸡蛋，午餐外卖，晚餐米饭',
    medicalReview: '曾核对用药', practicalConstraints: '午餐外卖', allergyStatus: 'confirmed_none', riskStatus: 'standard',
    nutritionTargets: [{ metric: '体重', baseline: '53 kg', target: '51 kg' }] }
  const { goal, assessment } = nutritionAssessmentPrefill(patient, previous)
  assert.equal(goal, '改善饮食')
  assert.equal(assessment.weight, 51)
  assert.equal(assessment.nutritionTargets[0].metric, '体重')
  assert.equal(assessment.reviewDate, '')
  assert.equal(assessment.allergyStatus, '')
  assert.equal(assessment.riskStatus, '')
  assert.equal(assessment.templateCompatibilityConfirmed, false)
  assert.equal(assessment.allergyDetails, '花生')
})

test('无上次评估时汇总档案膳食和疾病资料，不虚构已核实结论', () => {
  const patient = { lifestyle_data: { breakfastDesc: '燕麦和鸡蛋', lunchDetail: '外卖', dailyWater: '1500毫升内' },
    chronicDiseases: ['高血压'], healthProfile: { recentMedication: '有服药记录' }, preferences: '不吃辣' }
  const { assessment } = nutritionAssessmentPrefill(patient)
  assert.match(assessment.currentDiet, /早餐：燕麦和鸡蛋/)
  assert.match(assessment.currentDiet, /午餐：外卖/)
  assert.match(assessment.medicalReview, /档案记录/)
  assert.match(assessment.practicalConstraints, /不吃辣/)
  assert.equal(assessment.nutritionTargets.length, 1)
  assert.equal(assessment.nutritionTargets[0].baseline, '')
})
