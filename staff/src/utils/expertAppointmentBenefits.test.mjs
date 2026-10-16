import test from 'node:test'
import assert from 'node:assert/strict'
import { expertAppointmentBenefits } from './expertAppointmentBenefits.mjs'

test('family shared expert appointment remains available when own plan lacks it', () => {
  const entitlements = [
    { _id: 'own', status: 'active', packageName: '健康成长计划', rights: { aiEntitlements: {} } },
    { _id: 'family', status: 'active', packageName: '健康年轻态计划', ownerName: '家庭成员', familySharing: true,
      rights: { aiEntitlements: { expertAppointment: true } } },
  ]
  const ownPlans = [{ id: 'own', source: 'ledger', name: '健康成长计划', groups: { serviceStages: [] } }]
  assert.deepEqual(expertAppointmentBenefits(entitlements, ownPlans).map(item => item.id), ['family'])
})

test('cancelled expert rights do not restore access through another plan card', () => {
  const entitlements = [{ _id: 'old', status: 'cancelled', rights: { aiEntitlements: { expertAppointment: true } } }]
  const plans = [{ id: 'own', source: 'ledger', groups: { serviceStages: [{ services: [{ name: '专家约诊' }] }] } }]
  assert.deepEqual(expertAppointmentBenefits(entitlements, plans), [])
})
