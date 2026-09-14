const test=require('node:test'),assert=require('node:assert/strict');
const {slotAt,runMaterialSchedule}=require('../src/utils/groupMaterialSchedule');
test('Beijing noon and evening boundaries, no early run',()=>{
  assert.equal(slotAt(new Date('2026-09-15T03:59:59Z')),null);
  assert.equal(slotAt(new Date('2026-09-15T04:00:00Z')).key,'material-2026-09-15-12');
  assert.equal(slotAt(new Date('2026-09-15T11:59:59Z')).key,'material-2026-09-15-12');
  assert.equal(slotAt(new Date('2026-09-15T12:00:00Z')).key,'material-2026-09-15-20');
});
test('queued metadata uses native archive only at scheduled cutoff; unknown materials stay pending; revoked consent blocks',async t=>{
  const f=require('./helpers/serviceGroupFixture').buildFixture(),g=f.models.ServiceGroup.rows[0];g.archiveConsent=true;
  process.env.SERVICE_GROUP_MATERIAL_SCHEDULE_ENABLED='true';t.after(()=>delete process.env.SERVICE_GROUP_MATERIAL_SCHEDULE_ENABLED);
  const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),oss=require('../src/utils/oss');
  const file=await oss.uploadBuffer(png,'image/png','service-group-staging');
  const seed=async id=>f.models.ServiceGroupMessage.Model.create({groupId:g._id,messageId:id,sender:'synthetic',sentAt:new Date(),sealedText:'synthetic',expiresAt:new Date(Date.now()+86400000),attachment:{ossKey:file.key,name:'test.png',mimeType:'image/png',sha256:require('crypto').createHash('sha256').update(png).digest('hex')}});
  const image=await seed('scheduled'),unknown=await seed('unknown');
  const s=f.app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>s.close());
  const submit=async body=>fetch(`http://127.0.0.1:${s.address().port}/api/staff/service-groups/${g._id}/inbox/confirm`,{method:'POST',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify(body)});
  const body={messageIds:[String(image._id)],patientId:f.ids.patient,purpose:'checkin',title:'血压原图',date:'2026-09-14',documentCategory:'outpatient_record',schedule:true};
  assert.equal((await submit({...body,patientId:''})).status,400);
  assert.equal((await submit(body)).status,200);
  assert.equal(f.models.ServiceRecord.rows.length,0);
  const r=f.models.ServiceGroupReceipt.rows[0];assert.equal(r.state,'queued');
  const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  r.scheduledAt=new Date(`${day}T11:00:00+08:00`);
  const noon=new Date(`${day}T12:00:00+08:00`),evening=new Date(`${day}T20:00:00+08:00`);
  const map=new Map(),Cursor={
    updateOne:async(f,u)=>{if(!map.has(f._id))map.set(f._id,{seq:0});Object.assign(map.get(f._id),u.$set||{});if(u.$unset)for(const k of Object.keys(u.$unset))delete map.get(f._id)[k];},
    findOneAndUpdate:async(f,u)=>{const x=map.get(f._id);if(x.seq||x.leaseOwner)return null;Object.assign(x,u.$set);return {...x};}
  };
  assert.equal((await runMaterialSchedule({now:noon,Cursor})).archived,1);
  assert.equal(r.state,'archived');assert.equal(f.models.ServiceRecord.rows.length,1);
  assert.equal(await runMaterialSchedule({now:noon,Cursor}),undefined);
  assert.equal(f.models.ServiceGroupReceipt.rows.some(x=>String(x.messageId)===String(unknown._id)),false);
  const extra=await seed('revoked');await submit({...body,messageIds:[String(extra._id)]});
  f.models.ServiceGroupReceipt.rows[1].scheduledAt=new Date(+noon+1000);g.archiveConsent=false;
  assert.equal((await runMaterialSchedule({now:evening,Cursor})).blocked,1);
  assert.equal(f.models.ServiceRecord.rows.length,1);
});
