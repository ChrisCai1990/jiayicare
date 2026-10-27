const test=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {readFinancialArchive}=require('../src/utils/accountDeletionArchiveAccess');
const {sealArchive}=require('../src/utils/accountDeletionFinancialArchive');
const admin='111111111111111111111111',tenant='222222222222222222222222',archiveId='333333333333333333333333';
function fixture(){
 const key=randomBytes(32).toString('base64'),time=new Date('2026-10-27T00:00:00Z');
 const entry=sealArchive({snapshot:{sourceType:'Order',sourceId:'444444444444444444444444',fields:{paidAmount:10,moneyUnit:'CNY_yuan'},classification:{category:'tax_supporting_record',legalBasis:'synthetic fixture only',retainUntil:new Date('2036-12-31'),reviewedBy:admin,reviewedAt:time}},subject:{tenantId:tenant},requestId:'555555555555555555555555',keyId:'v1',encryptionKey:key});
 Object.assign(entry,{_id:archiveId,verifiedAt:time});
 let writes=0,reads=0,row;
 return {entry,writes:()=>writes,reads:()=>reads,input:{actor:{_id:admin,tenantId:tenant,role:'superadmin'},archiveId,purpose:'tax',reason:'合成测试查账',now:()=>time,env:{ACCOUNT_DELETION_FINANCE_ADMIN_IDS:admin,ACCOUNT_DELETION_ARCHIVE_KEYS:JSON.stringify({v1:key})},
 archives:{objectId:x=>x,findOne:async q=>{reads++;return q.tenantId===tenant && q._id===archiveId?entry:null;}},
 audit:{insertOne:async e=>{writes++;row={...e,_id:'audit-id'};return {acknowledged:true,insertedId:'audit-id'};},findOne:async()=>row}}};
}
test('only specifically authorized institution finance admin can read; durable audit precedes plaintext',async()=>{
 const f=fixture();const result=await readFinancialArchive(f.input);assert.equal(result.fields.paidAmount,10);assert.equal(f.writes(),1);assert.equal(JSON.stringify(result).includes('ciphertext'),false);
});
test('ordinary admin, staff, platform super and missing allowlist cannot read or decrypt',async()=>{
 for(const actor of [{_id:admin,role:'superadmin'},{_id:admin,tenantId:tenant,role:'doctor'},{_id:admin,tenantId:tenant,role:'platformSuper'},{_id:'666666666666666666666666',tenantId:tenant,role:'superadmin'}]) {
  const f=fixture();await assert.rejects(readFinancialArchive({...f.input,actor}),e=>e.status===403);assert.equal(f.reads(),0);
 }
 const f=fixture();f.input.env.ACCOUNT_DELETION_FINANCE_ADMIN_IDS='';await assert.rejects(readFinancialArchive(f.input),e=>e.status===403);
});
test('tenant cannot be overridden, and missing purpose or failed audit never returns payload',async()=>{
 const f=fixture();f.input.actor.tenantId='777777777777777777777777';await assert.rejects(readFinancialArchive(f.input),e=>e.status===404);assert.equal(f.writes(),0);
 const g=fixture();g.input.purpose='marketing';await assert.rejects(readFinancialArchive(g.input),e=>e.status===400);
 const h=fixture();h.input.audit.insertOne=async()=>({acknowledged:false});await assert.rejects(readFinancialArchive(h.input),e=>e.status===503);
 const j=fixture();j.input.audit.findOne=async()=>null;await assert.rejects(readFinancialArchive(j.input),e=>e.status===503);
});
test('wrong key, unverified archive, or missing key cannot expose a record',async()=>{
 const f=fixture();f.input.env.ACCOUNT_DELETION_ARCHIVE_KEYS=JSON.stringify({v1:randomBytes(32).toString('base64')});await assert.rejects(readFinancialArchive(f.input));
 const g=fixture();g.entry.verifiedAt=null;await assert.rejects(readFinancialArchive(g.input),e=>e.status===404);
 const h=fixture();h.input.env.ACCOUNT_DELETION_ARCHIVE_KEYS='{}';await assert.rejects(readFinancialArchive(h.input),e=>e.status===503);assert.equal(h.writes(),0);
});
