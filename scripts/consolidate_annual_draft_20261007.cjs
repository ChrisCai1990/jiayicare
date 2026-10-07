const assert = require('node:assert/strict');

// Explicit repair of the reviewed legacy draft. No fuzzy matching or published-plan mutation.
const pairs = [
 ['颈动脉超声弹性成像', '完成颈动脉超声弹性成像，评估斑块稳定性及他汀治疗达标情况'],
 ['胃镜复查周期确认、PPI或胆汁结合剂评估', '确认胃镜复查周期及PPI或胆汁结合剂治疗必要性，出具书面随访计划'],
 ['低剂量胸部CT随访时间确认', '核对肺结节原始影像，明确下一次低剂量胸部CT随访时间及安排'],
];
function revise(moduleData) {
 const next = structuredClone(moduleData);
 const visits = next.medical_treatment?.records || [];
 const repeats = next.abnormal_followup?.records || [];
 assert.equal(repeats.length, 3, '原草稿复查条目已变化，停止修订');
 for (const [title, reason] of pairs) {
  const duplicates = repeats.filter(r => r.items === title);
  assert.equal(duplicates.length, 1, '重复项目不唯一');
  const duplicate = duplicates[0];
  assert.ok(duplicate.timingSourceId);
  const matches = visits.filter(r => r.timingSourceId === duplicate.timingSourceId && r.visit_time === duplicate.time && r.department === duplicate.department);
  assert.equal(matches.length, 1, '就医安排来源或时间不同，停止合并');
  const visit = matches[0];
  for (const field of ['hospital','expert','serviceType','completionStandard']) {
   assert.ok(!visit[field] || !duplicate[field] || visit[field] === duplicate[field], `字段冲突：${field}`);
   if (!visit[field] && duplicate[field]) visit[field] = duplicate[field];
  }
  assert.equal(visit.serviceMode || 'reminder', 'reminder');
  assert.equal(duplicate.serviceMode || 'reminder', 'reminder');
  visit.reason = reason;
  visit.sourceIds = [...new Set([...(visit.sourceIds || []), ...(duplicate.sourceIds || [])])];
  visit.basisSummary = [...new Set([visit.basisSummary, duplicate.basisSummary].filter(Boolean))].join('\n');
 }
 next.abnormal_followup.records = [];
 const targets = next.management_targets?.records || [];
 for (const visit of visits) {
  const matches = targets.filter(t => t.goal && visit.basisSummary?.includes(t.goal));
  assert.equal(matches.length, 1, '管理目标来源不唯一');
  visit.issueId = matches[0].issueId;
  if (!visit.goal) visit.goal = matches[0].goal;
 }
 return next;
}
module.exports = { revise };

if (require.main === module) {
 require('dotenv').config({ path: 'backend/.env', quiet: true });
 const mongoose = require('mongoose');
 (async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Plan = require('../backend/src/models/AnnualPlan');
  const FollowUp = require('../backend/src/models/FollowUp');
  const id = '6ac6169e07e2feec6321fb77';
  const revisionId = 'legacy-arrangements-consolidation-20261007';
  const p = await Plan.findById(id).select('+supplementRevisions').lean();
  assert.ok(p && String(p.patientId) === '6a4f3531962a3b13144af513');
  if (p.supplementRevisions?.some(r => r.id === revisionId)) { console.log('修订已完成，不重复执行'); return; }
  assert.ok(!p.pushedAt && !p.confirmedAt && !p.frozenAt && !p.formalizedAt, '只能修订未发布草稿');
  assert.equal(await FollowUp.countDocuments({$or:[{sourceAnnualPlanId:id},{sourceId:id}]}),0,'已存在关联任务，停止');
  const next = revise(p.moduleData);
  console.log(JSON.stringify({planId:id,removedDuplicates:3,managementTargets:next.management_targets.records.length,medicalVisits:next.medical_treatment.records.length,otherExams:next.checkup_completion.records.length,mode:process.argv.includes('--apply')?'apply':'preview'}));
  if (process.argv.includes('--apply')) {
   const result = await Plan.updateOne({_id:id,updatedAt:p.updatedAt,pushedAt:null,confirmedAt:null,frozenAt:null,formalizedAt:null,'supplementRevisions.id':{$ne:revisionId}},{$set:{moduleData:next},$push:{supplementRevisions:{id:revisionId,type:'draft_consolidation',status:'applied',appliedAt:new Date(),reason:'客户授权：在原草稿内合并同次就医的重复安排，保留目标与既有日期、科室；无关联任务',beforeModuleData:p.moduleData,afterModuleData:next}}});
   assert.equal(result.modifiedCount,1,'草稿已变化，未覆盖');
   console.log('原草稿已保存；修订前后快照已留存；未推送、未派单');
  }
 })().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
}
