// Synthetic AI draft; actual one-click coordinator + review/publication/service APIs.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url'), m = require('mongoose');
(async () => {
  const s = JSON.parse(fs.readFileSync(process.argv[2])), dir = path.dirname(process.argv[2]);
  assert.equal(s.api, 'http://127.0.0.1:3000/api'); assert.match(s.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await m.connect(`mongodb://127.0.0.1:27134/${s.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), Report = require('../../src/models/MedicalReport');
  const Draft = require('../../src/models/ReportFollowUpDraft'), FollowUp = require('../../src/models/FollowUp');
  assert.equal((await User.findById(s.patientId)).name, '隔离验收客户（纯虚构）');
  const service = JSON.parse(fs.readFileSync(path.join(dir, 'service-http.json'))), closure = JSON.parse(fs.readFileSync(path.join(dir, 'closure-http.json')));
  let token;
  async function call(route, method='GET', body, expected=200) {
    const r = await fetch(s.api+route, {method, headers:{'content-type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body:body ? JSON.stringify(body):undefined});
    const json=await r.json(); assert.equal(r.status,expected,JSON.stringify(json)); return json;
  }
  const a=s.accounts.find(x=>x.role==='familyDoctor'); token=(await call('/staff/login','POST',{username:a.username,password:a.password})).data.token;
  const route=`/staff/followups/${service.taskIds.result_review}`;
  const item=(await call(route+'/checkup-outcome-context')).data.item;
  await call(route,'PUT',{status:'completed',content:'missing attestation'},409);
  let report=await Report.findById(closure.reportId).lean(); assert.equal(String(report.user),s.patientId);
  // Fixture source sequence only; no AI generation is claimed.
  if (!report.followUpSourceEvent?.sequence) {
    await Report.collection.updateOne({_id:report._id,user:report.user},{$set:{followUpSourceEvent:{sequence:1}}});
    report=await Report.findById(report._id).lean();
  }
  const draft=await Draft.findOne({reportId:report._id,title:'隔离体检后续草稿（非AI）'}) || await Draft.create({patientId:s.patientId,reportId:report._id,title:'隔离体检后续草稿（非AI）',
    sourceSequence:report.followUpSourceEvent.sequence,sourceKey:`${report._id}:${report.followUpSourceEvent.sequence}:${require('../../src/utils/reportFollowUpSource').sourceDigest(report)}`,
    sourceSnapshot:{title:report.title},status:'advisor_review',followUpAutomation:{status:'ready'},
    followUpDrafts:[{title:'模拟后续复查',date:'2026-11-01',content:'纯模拟管理安排',category:'review',requiresService:true}]});
  const {submitMergedOutcome}=await import(pathToFileURL(path.resolve(__dirname,'../../../staff/src/utils/mergedOutcomeReview.mjs')));
  const api={reviewReportFollowUpDraft:(id,body)=>call(`/staff/report-followups/${id}/review`,'POST',{...body,serviceReviewId:service.taskIds.result_review}),
    reviewFollowUpOutcome:(_id,body)=>call(route,'PUT',{status:'completed',content:body.note,checkupOutcome:body})};
  const args={api,item,reportIds:[String(report._id)],decision:'new_plan',note:'隔离一次确认后续安排',checked:true,draft:JSON.parse(JSON.stringify(draft))};
  const first=await submitMergedOutcome(args);
  assert.equal(first.data.status,'completed'); assert.notEqual((await FollowUp.findById(item._id)).status,'completed');
  const count=await FollowUp.countDocuments({sourceId:draft._id}); assert.equal(count,2);
  await submitMergedOutcome(args); assert.equal(await FollowUp.countDocuments({sourceId:draft._id}),count);
  await call(route,'PUT',{status:'completed',content:'changed',checkupOutcome:{...first.data.checkupOutcomeDecision.body,note:'changed'}},409);
  fs.writeFileSync(path.join(dir,'merged-checkup-new-plan.json'),JSON.stringify({syntheticDraft:true,originalId:item._id,draftId:String(draft._id),nextTasks:count,oneConfirmation:true},null,2));
  console.log('PASS one confirmation: draft review/publication + service review, 2 unique followup/service tasks; original open until acceptance/redemption; changed replay rejected');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>m.disconnect());
