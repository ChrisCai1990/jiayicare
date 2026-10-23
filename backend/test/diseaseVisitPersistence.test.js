const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isDeepStrictEqual } = require('node:util');
const { sourceIds, findReportArchive } = require('../../shared/diseaseReportArchive.cjs');
const { isClinicalVisitEntry, mergeVisitEntries, removeVisitSource } = require('../../shared/diseaseVisit.cjs');

const routes = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const normalizerSource = routes.match(/const normalizedDiseaseRecords = patient => \{[\s\S]*?\n\};/)[0];
const normalizedDiseaseRecords = vm.runInNewContext(
  `${normalizerSource}\nnormalizedDiseaseRecords`,
  { hasMedicalSummary: () => false },
);

const entries = () => [
  { _id:'a', occurredAt:new Date('2026-09-01T00:00:00Z'), sourceType:'medical_record', sourceReportId:'report-a', content:'眼震检查' },
  { _id:'b', occurredAt:new Date('2026-09-01T00:00:00Z'), sourceType:'medical_record', content:'头晕复诊' },
];
const response = () => ({ statusCode:200, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } });

async function invoke(routePath, params, body) {
  const start = routes.indexOf(`router.post('${routePath}'`);
  assert.ok(start >= 0);
  const end = routes.indexOf('\nrouter.', start + 1);
  let handler, query, update;
  const patient = { _id:'patient', diseaseRecords:[{ _id:'disease', courseEntries:entries() }] };
  const persisted = structuredClone(patient.diseaseRecords);
  const context = {
    router:{ post:(_path,...handlers) => { handler=handlers.at(-1); } },
    staffAuth:()=>{}, checkPermission:()=>{},
    getVisiblePlanPatientIds:async()=>['patient'],
    User:{ findById:()=>({ select:()=>({ lean:async()=>patient }) }),
      collection:{ updateOne:async(q,u) => { query=q; update=u; return { matchedCount:isDeepStrictEqual(q.diseaseRecords,persisted) ? 1 : 0 }; } } },
    MedicalReport:{ updateMany:async()=>({}) },
    normalizedDiseaseRecords, sourceIds, isClinicalVisitEntry, mergeVisitEntries,
    cleanMedicalText:value=>String(value || '').trim(),
  };
  vm.runInNewContext(routes.slice(start,end),context);
  const res = response();
  await handler({ params:{ id:'patient', recordId:'disease', ...params },
    body, staff:{ role:'familyDoctor', _id:'advisor', name:'顾问' } }, res);
  assert.deepEqual(patient.diseaseRecords,persisted,'loaded version used by CAS must remain unchanged');
  return { res, query, update };
}

test('same-day merge preserves original CAS snapshot and persists one visit', async() => {
  const { res, query, update } = await invoke(
    '/patients/:id/disease-records/:recordId/course-entries/merge',
    {}, { targetEntryId:'a', sourceEntryId:'b', confirmSameVisit:true },
  );
  assert.equal(res.statusCode,200,JSON.stringify(res.body));
  assert.equal(query.diseaseRecords[0].courseEntries.length,2);
  assert.equal(update.$set.diseaseRecords[0].courseEntries.length,1);
  assert.equal(update.$set.diseaseRecords[0].courseEntries[0].visitDocuments.length,2);
});

test('duplicate cancellation preserves original CAS snapshot and audit history', async() => {
  const { res, query, update } = await invoke(
    '/patients/:id/disease-records/:recordId/course-entries/:entryId/cancel',
    { entryId:'b' }, { reason:'历史重复录入' },
  );
  assert.equal(res.statusCode,200,JSON.stringify(res.body));
  assert.equal(query.diseaseRecords[0].courseEntries.length,2);
  assert.equal(update.$set.diseaseRecords[0].courseEntries.length,1);
  assert.equal(update.$set.diseaseRecords[0].cancelledCourseEntries.length,1);
  assert.equal(update.$set.diseaseRecords[0].cancelledCourseEntries[0].cancellationReason,'历史重复录入');
});

test('source-linked duplicate revocation preserves original CAS snapshot', async() => {
  const start = routes.indexOf("router.post('/medical-reports/:id/health-course-revoke'");
  const end = routes.indexOf('\nrouter.', start + 1);
  let handler, update;
  const patient = { _id:'patient', diseaseRecords:[{ _id:'disease', courseEntries:entries() }] };
  const persisted = structuredClone(patient.diseaseRecords);
  const report = { _id:'report-a', user:'patient', healthCourseDraft:{ status:'approved', approvedEntryId:'a' },
    dataEditLog:[], save:async()=>{} };
  vm.runInNewContext(routes.slice(start,end),{
    router:{ post:(_path,...handlers)=>{handler=handlers.at(-1)} },
    staffAuth:()=>{}, getVisiblePlanPatientIds:async()=>['patient'],
    MedicalReport:{ findById:async()=>report },
    User:{ findById:()=>({select:()=>({lean:async()=>patient})}),
      collection:{updateOne:async(q,u)=>{update=u;return{matchedCount:isDeepStrictEqual(q.diseaseRecords,persisted)?1:0}}}},
    normalizedDiseaseRecords, findReportArchive, sourceIds, removeVisitSource,
    cleanMedicalText:value=>String(value || '').trim(),
  });
  const res = response();
  await handler({ params:{id:'report-a'}, body:{reason:'历史重复入档',entryId:'a'},
    staff:{role:'familyDoctor',_id:'advisor',name:'顾问'} },res);
  assert.equal(res.statusCode,200,JSON.stringify(res.body));
  assert.deepEqual(patient.diseaseRecords,persisted);
  assert.equal(update.$set.diseaseRecords[0].courseEntries.length,1);
  assert.equal(report.healthCourseDraft.status,'dismissed');
  assert.equal(report.dataEditLog.length,1);
});
