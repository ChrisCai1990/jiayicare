import test from 'node:test'
import assert from 'node:assert/strict'
import { planningAdviceFromTask, hasPlanningAdvice, planningAdviceMessage } from '../src/utils/medicalPlanningAdvice.js'

test('planning advice uses the advisor handoff and prepares a customer-review draft', () => {
  const plan = { problemAnalysis: '需进一步评估', expertRecommendation1: '甲专家，A医院心内科', expertRecommendation2: '乙专家，B医院心内科', planningRemarks: '携带检查资料' }
  assert.equal(planningAdviceFromTask({ formData: { advisorSnapshot: plan } }), plan)
  const draft = planningAdviceMessage(plan)
  assert.match(draft, /甲专家，A医院心内科/)
  assert.match(draft, /乙专家，B医院心内科/)
  assert.match(draft, /是否还需要我们协助预约、陪诊/)
});

test('legacy advisor conclusion remains visible; no advice never creates a push draft', () => {
  const plan = { assessmentSummary: '建议携带报告面诊' }
  assert.equal(hasPlanningAdvice(plan), true)
  assert.match(planningAdviceMessage(plan), /建议携带报告面诊/)
  assert.equal(planningAdviceMessage({}), '')
});
