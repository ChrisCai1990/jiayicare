const test = require('node:test');
const assert = require('node:assert/strict');
const { initialImport, saveSection, reviewSection, SECTION_LABELS } = require('../src/utils/initialArchiveReview');
const { buildArchiveDraft } = require('../src/utils/archiveImport');
const actor = { _id: 'staff', name: '核实人员', role: 'healthManager' };
const questionnaire = { _id:'q',title:'健康问卷表（成人）', questions:[{id:'family',archiveField:'healthProfile.familyHistoryNote'}, {id:'symptom',archiveField:'healthProfile.recentSymptoms'}, {id:'allergy',archiveField:'healthProfile.drugAllergy'}] };
const response = { _id:'r',answers:{family:'父亲高血压',symptom:['无'],allergy:'无'},submittedAt:new Date() };
const initial = user => initialImport(user,questionnaire,response,buildArchiveDraft(user,questionnaire,response));
test('first intake writes empty fields and schedules all six review sections, preserving explicit negative answers',()=>{
  const result=initial({_id:'u',healthProfile:{}});
  assert.equal(result.update.$set['healthProfile.familyHistoryNote'],'父亲高血压');
  const review=result.update.$set.initialArchiveReview;
  assert.equal(review.status,'pending');assert.equal(Object.keys(review.sections).length,6);
  assert.deepEqual(review.items.find(i=>i.questionId==='symptom').answer,['无']);
  assert.equal(review.responseId,'r');
});
test('existing manual values are never overwritten and repeated first intake cannot restart completed review',()=>{
  const user={_id:'u',healthProfile:{familyHistoryNote:'人工更新'}};
  assert.equal(initial(user).update.$set['healthProfile.familyHistoryNote'],undefined);
  assert.equal(initial({...user,initialArchiveReview:{status:'completed'}}),null);
});
test('family updates retain original records, distinguish new relatives, and reject stale edits',()=>{
  let user={_id:'u'};
  let mutation=saveSection(user,'family',{revision:0,presence:'present',records:[{disease:'高血压',relationship:'父亲'}]},actor);
  const first=mutation.update.$set['coreHealthArchive.family'];
  user.coreHealthArchive={family:first};
  mutation=saveSection(user,'family',{revision:1,presence:'present',records:[...first.records,{disease:'糖尿病',relationship:'母亲'}]},actor);
  assert.equal(mutation.update.$set['coreHealthArchive.family'].records.length,2);
  assert.equal(mutation.update.$push.coreHealthArchiveHistory.before.records.length,1);
  assert.throws(()=>saveSection(user,'family',{revision:0,presence:'none',records:[]},actor),/已更新/);
  assert.throws(()=>saveSection(user,'family',{revision:1,presence:'none',records:first.records},actor),/已有具体记录/);
});
test('reversal needs date and evidence, recurrence preserves reversal in timeline',()=>{
  const first=saveSection({_id:'u'},'disease',{revision:0,presence:'present',records:[{disease:'测试疾病',status:'持续',diagnosedAt:'2020'}]},actor).update.$set['coreHealthArchive.disease'];
  const user={_id:'u',coreHealthArchive:{disease:first}};
  const row={...first.records[0],status:'已逆转'};
  assert.throws(()=>saveSection(user,'disease',{revision:1,presence:'present',records:[row]},actor),/时间/);
  row.statusAt='2026-09';assert.throws(()=>saveSection(user,'disease',{revision:1,presence:'present',records:[row]},actor),/依据/);
  row.evidence='医生复查结论';
  const reversed=saveSection(user,'disease',{revision:1,presence:'present',records:[row]},actor).update.$set['coreHealthArchive.disease'];
  const recurrent=saveSection({_id:'u',coreHealthArchive:{disease:reversed}},'disease',{revision:2,presence:'present',records:[{...reversed.records[0],status:'复发',statusAt:'2027'}]},actor).update.$set['coreHealthArchive.disease'];
  assert.equal(recurrent.records[0].timeline.length,3);
  assert.equal(recurrent.records[0].timeline[1].statusAt,'2026-09');
  assert.equal(recurrent.records[0].timeline[1].evidence,'医生复查结论');
});
test('review requires explicit section data, checked questions and note, completes only after all sections',()=>{
  let user={_id:'u',initialArchiveReview:initial({_id:'u'}).update.$set.initialArchiveReview,coreHealthArchive:{}};
  const payload={revision:0,sectionRevision:0,status:'reviewed',note:'已电话核实',checkedQuestionIds:['family','symptom','allergy']};
  assert.throws(()=>reviewSection(user,'family',payload,actor),/先补充/);
  user.coreHealthArchive.family={presence:'unknown'};
  assert.throws(()=>reviewSection(user,'family',{...payload,checkedQuestionIds:[]},actor),/逐项/);
  assert.throws(()=>reviewSection(user,'family',{...payload,note:''},actor),/依据/);
  for(const key of Object.keys(SECTION_LABELS)) {
    if(['disease','allergy','symptom','medication'].includes(key))user.coreHealthArchive[key]={presence:'none'};
    const result=reviewSection(user,key,{...payload,revision:user.initialArchiveReview.revision},actor);
    user.initialArchiveReview=result.update.$set.initialArchiveReview;
    if(key!=='routine')assert.equal(user.initialArchiveReview.status,'pending');
  }
  assert.equal(user.initialArchiveReview.status,'completed');
  assert.throws(()=>reviewSection(user,'family',{...payload,revision:6},actor),/已完成/);
});
test('editing a verified section during intake reopens only that section; later additions do not restart intake',()=>{
  const review=initial({_id:'u'}).update.$set.initialArchiveReview;
  review.sections.family={status:'reviewed'};
  const mutation=saveSection({_id:'u',initialArchiveReview:review},'family',{revision:0,presence:'unknown',records:[]},actor);
  assert.equal(mutation.update.$set['initialArchiveReview.sections.family'].status,'pending');
  review.status='completed';
  assert.equal(saveSection({_id:'u',initialArchiveReview:review},'family',{revision:0,presence:'none',records:[]},actor).update.$set['initialArchiveReview.sections.family'],undefined);
});
test('allergy correction updates legacy readers and preserves original evidence in history',()=>{
  const mutation=saveSection({_id:'u',healthProfile:{drugAllergy:'旧自述'}},'allergy',{revision:0,presence:'present',records:[{substance:'测试药物',kind:'药物不良反应',reaction:'皮疹'}]},actor);
  assert.match(mutation.update.$set['healthProfile.drugAllergy'],/皮疹/);
  assert.equal(mutation.update.$push.coreHealthArchiveHistory.legacyBefore.drugAllergy,'旧自述');
});


test('initial medication baseline never rewrites live medication fields or collections',()=>{
  const u={_id:'u',healthProfile:{medicHistory:'原问卷自述',medications:['当前药物']}};
  const result=saveSection(u,'medication',{revision:0,presence:'present',records:[{name:'建档时药物',dosage:'旧剂量',baselineAt:'2024年'}]},actor);
  assert.deepEqual(Object.keys(result.update.$set),['coreHealthArchive.medication']);
  assert.equal(result.update.$set['coreHealthArchive.medication'].records[0].name,'建档时药物');
  assert.equal(Object.hasOwn(result.filter,'undefined'),false);
  assert.deepEqual(u.healthProfile.medications,['当前药物']);
});
