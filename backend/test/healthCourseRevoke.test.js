const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { findReportArchive, sourceIds } = require('../../shared/diseaseReportArchive.cjs');
const { mergeVisitEntries, removeVisitSource } = require('../../shared/diseaseVisit.cjs');
const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.post('/medical-reports/:id/health-course-revoke'");
const end = source.indexOf("router.put('/medical-reports/:id/health-course-draft'", start);

async function revoke(entry, entryId = 'visit', match = 1) {
  let handler, saved = false, write;
  const report = { _id:'report-b', user:'patient', healthCourseDraft:{status:'approved', approvedEntryId:'visit', finalContent:{sourceReportId:'report-b'}}, dataEditLog:[], save:async()=>{saved=true} };
  const patient = { _id:'patient', diseaseRecords:[{_id:'dossier', name:'测试专病', courseEntries:[entry]}] };
  vm.runInNewContext(source.slice(start,end), {
    router:{post:(_path,...callbacks)=>{handler=callbacks.at(-1)}}, staffAuth:()=>{},
    MedicalReport:{findById:async()=>report}, getVisiblePlanPatientIds:async()=>['patient'],
    User:{findById:()=>({select:()=>({lean:async()=>patient})}), collection:{updateOne:async(query,update)=>{write={query,update};return {matchedCount:match}}}},
    normalizedDiseaseRecords:value=>structuredClone(value.diseaseRecords), findReportArchive, sourceIds, removeVisitSource,
    cleanMedicalText:(value,max)=>String(value||'').trim().slice(0,max),
  });
  const response = { code:200, status(code){this.code=code;return this}, json(body){this.body=body} };
  await handler({params:{id:'report-b'},staff:{role:'familyDoctor',_id:'doctor',name:'审核顾问'},body:{entryId,reason:'与已有病历重复'}},response);
  return {response,report,saved,write};
}

test('撤销单份误入档资料，保留原件与撤销原因和操作留痕', async () => {
  const entry = {_id:'visit', sourceReportId:'report-b', content:'重复资料'};
  const result = await revoke(entry);
  assert.equal(result.response.code,200);
  assert.equal(result.write.update.$set.diseaseRecords[0].courseEntries.length,0);
  assert.equal(result.report.healthCourseDraft.status,'dismissed');
  assert.equal(result.report.healthCourseDraft.revokeReason,'与已有病历重复');
  assert.equal(result.report.healthCourseDraft.revokedEntrySnapshot.content,'重复资料');
  assert.equal(result.report.dataEditLog.length,1);
});

test('撤销同次就医的一份资料，其他原件和记录保持可见', async () => {
  const date = new Date('2025-01-22T00:00:00+08:00');
  const first = {_id:'visit',occurredAt:date,sourceReportId:'report-a',sourceTitle:'资料 A',content:'正确资料'};
  const second = {_id:'visit-b',occurredAt:date,sourceReportId:'report-b',sourceTitle:'资料 B',content:'重复资料'};
  const entry = mergeVisitEntries(first,second,{at:new Date('2026-10-23T00:00:00Z')});
  const result = await revoke(entry);
  assert.equal(result.response.code,200);
  const remaining = result.write.update.$set.diseaseRecords[0].courseEntries[0];
  assert.equal(remaining.sourceReportId,'report-a');
  assert.equal(remaining.content,'正确资料');
  assert.equal(remaining.sourceRemovalHistory[0].reason,'与已有病历重复');
});

test('页面记录过期或档案并发修改时不撤销入档', async () => {
  const entry = {_id:'visit',sourceReportId:'report-b',content:'资料'};
  for (const [entryId,match] of [['old-visit',1],['visit',0]]) {
    const result = await revoke(entry,entryId,match);
    assert.equal(result.response.code,409);
    assert.equal(result.saved,false);
  }
});
