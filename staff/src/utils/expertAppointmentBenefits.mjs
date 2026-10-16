// Use the effective entitlement ledger for service access. Membership plan cards
// intentionally show only plans owned by the customer and cannot represent a
// family member's shared expert appointment benefit.
export function expertAppointmentBenefits(entitlements = [], plans = []) {
  const ledgerBenefits = entitlements.filter(item => item.status === 'active'
    && item.rights?.aiEntitlements?.expertAppointment === true)
    .map(item => ({ id: String(item._id), name: item.packageName,
      ownerName: item.ownerName, familySharing: item.familySharing,
      validUntil: item.validUntil }))
  if (ledgerBenefits.length) return ledgerBenefits
  return plans.filter(plan => plan.source === 'configuration'
    && plan.groups?.serviceStages?.some(stage => stage.services?.some(service => /专家约诊/.test(service.name || ''))))
    .map(plan => ({ id: plan.id, name: plan.name, validUntil: plan.validUntil }))
}
