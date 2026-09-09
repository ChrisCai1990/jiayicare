function summarizeInsuranceOperations(cases = [], enrolledMembers = 0) {
  const result = {
    enrolledMembers, totalCases: cases.length, byStatus: {}, byScenario: {}, submittedClaims: 0, paidClaims: 0,
    claimPaidRate: 0, averageResolutionHours: 0,
    financials: { totalMemberPaid: 0, totalDirectBilling: 0, totalInsurancePaid: 0 },
  };
  let totalResolutionHours = 0;
  let resolvedCases = 0;
  for (const item of cases) {
    result.byStatus[item.status] = (result.byStatus[item.status] || 0) + 1;
    result.byScenario[item.scenario] = (result.byScenario[item.scenario] || 0) + 1;
    if (item.claim?.submittedAt) result.submittedClaims += 1;
    if (item.claim?.status === 'paid') result.paidClaims += 1;
    result.financials.totalMemberPaid += Number(item.financials?.memberPaidAmount || 0);
    result.financials.totalDirectBilling += Number(item.financials?.directBillingAmount || 0);
    result.financials.totalInsurancePaid += Number(item.financials?.finalPaidAmount || 0);
    const resolvedAt = item.claim?.paidAt || item.claim?.decidedAt;
    if (resolvedAt && item.claim?.submittedAt) {
      totalResolutionHours += Math.max(0, new Date(resolvedAt) - new Date(item.claim.submittedAt)) / 36e5;
      resolvedCases += 1;
    }
  }
  result.claimPaidRate = result.submittedClaims ? result.paidClaims / result.submittedClaims : 0;
  result.averageResolutionHours = resolvedCases ? totalResolutionHours / resolvedCases : 0;
  return result;
}

module.exports = { summarizeInsuranceOperations };
