function assertPlanVersion(plan, version) {
  const hasAmendment=(plan?.supplementRevisions||[]).some(r=>r.status==='applied');
  if ((version && (!plan || new Date(plan.updatedAt).toISOString()!==version)) || (hasAmendment&&!version)) {
    throw Object.assign(new Error('年度方案已有更新或研判补录，请刷新后再保存，避免覆盖补录内容'),{statusCode:409});
  }
}
module.exports={assertPlanVersion};
