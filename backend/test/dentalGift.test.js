const test=require('node:test'),assert=require('node:assert/strict');
const {transition,view,idFor}=require('../src/utils/dentalGift');
const now=new Date('2026-09-30T04:00:00Z');
test('未登记不推定未使用，核对后才允许预约',()=>{
 assert.equal(view(null,now).status,'unknown');
 assert.throws(()=>transition(null,{action:'book',note:'确认',institution:'机构',appointmentDate:'2026-10-02'},now));
 assert.deepEqual(transition(null,{action:'verify',note:'核对未使用'},now),{status:'available'});
 assert.throws(()=>transition(null,{action:'verify',note:''},now));
});
test('只记录确认后的预约，日期须在有效期内；过期不能新预约',()=>{
 assert.equal(transition({status:'available'},{action:'book',note:'机构已确认',institution:'机构',appointmentDate:'2026-10-31'},now).status,'booked');
 for(const date of ['2026-11-01','2026-09-29','2026-09-31'])assert.throws(()=>transition({status:'available'},{action:'book',note:'记录',institution:'机构',appointmentDate:date},now));
 assert.throws(()=>transition(null,{action:'verify',note:'记录'},new Date('2026-11-01')));
});
test('完成核销一次且保留历史补登记，不能填写未来完成日期',()=>{
 assert.equal(transition({status:'booked',appointmentDate:'2026-09-29'},{action:'complete',note:'机构确认完成',completedDate:'2026-09-30'},now).status,'used');
 assert.equal(transition(null,{action:'historical',note:'查到此前记录',completedDate:'2026-09-20'},now).status,'used');
 assert.throws(()=>transition({status:'used'},{action:'verify',note:'不能恢复'},now));
 assert.throws(()=>transition(null,{action:'historical',note:'记录',completedDate:'2026-10-01'},now));
 assert.equal(idFor('p'),idFor('p'));assert.notEqual(idFor('p'),idFor('q'));
});

test('并发核对只建一条患者台账，旧版本更新拒绝', async t=>{
 const paths=['../src/models/User','../src/models/Enterprise','../src/models/DentalGiftUsage'].map(p=>require.resolve(p));
 const original=paths.map(p=>require.cache[p]);let stored=null;
 const lean=value=>({lean:async()=>structuredClone(value)});
 const model={findById:()=>lean(stored),create:async value=>{if(stored)throw Object.assign(Error('duplicate'),{code:11000});stored=structuredClone(value);return stored},findOneAndUpdate:async(q,u)=>{if(!stored||q.__v!==stored.__v||q.status!==stored.status)return null;Object.assign(stored,u.$set);stored.__v++;stored.history.push(u.$push.history);return structuredClone(stored)}};
 const stubs=[{findById:()=>({select:()=>lean({enterpriseId:'e',membershipTier:'enterprise'})})},{findOne:()=>({select:()=>lean({_id:'e'})})},model];
 paths.forEach((p,i)=>{require.cache[p]={id:p,filename:p,loaded:true,exports:stubs[i]}});
 t.after(()=>paths.forEach((p,i)=>{if(original[i])require.cache[p]=original[i];else delete require.cache[p]}));
 // Historical recording is date-bounded independently of today's date.
 const service=require('../src/utils/dentalGift');
 const body={action:'historical',revision:null,note:'核对原始记录',completedDate:'2026-01-01'};
 const results=await Promise.allSettled([service.update('p',body,'a'),service.update('p',body,'b')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(stored.history.length,1);assert.equal(stored.status,'used');
 await assert.rejects(service.update('p',body,'a'),/更新/);
});
