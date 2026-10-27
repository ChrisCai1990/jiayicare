const test=require('node:test'),assert=require('node:assert/strict');
const {inventoryLegacyCopies,eraseLegacyCopies}=require('../src/utils/accountDeletionLegacy');
const user='111111111111111111111111',tenant='222222222222222222222222',other='333333333333333333333333';
const subject={userId:user,tenantId:tenant};
const id=n=>String(n).padStart(24,'0');
function database(fixtures) {
 const rows=structuredClone(fixtures), deleted=[];
 return {rows,deleted,listCollections:()=>({toArray:async()=>Object.keys(rows).map(name=>({name,type:'collection'}))}),
 collection:name=>({
  find:()=>({async *[Symbol.asyncIterator](){yield* rows[name];}}),
  findOne:async q=>rows[name].find(row=>row._id===q._id)||null,
  deleteOne:async q=>{const i=rows[name].findIndex(row=>row._id===q._id);if(i<0)return {deletedCount:0};rows[name].splice(i,1);deleted.push(q._id);return {deletedCount:1};},
 })};
}
const options=db=>({db,models:{},subject,inventory:{documents:[]},storage:{ossOrigins:['https://owned.example']}});
test('single-owner legacy files enter the manifest; another customer and secrets never leak',async()=>{
 const db=database({medicalreportmaintenancearchives:[{_id:id(1),patientId:user,snapshot:{fileUrl:'https://owned.example/r.pdf?signature=private'}},{_id:id(2),patientId:other}]});
 const plan=await inventoryLegacyCopies(options(db));
 assert.equal(plan.documents.length,1);assert.equal(plan.files[0].key,'r.pdf');assert.deepEqual(plan.blockers,[]);
 assert.equal(JSON.stringify(plan).includes('private'),false);
 await eraseLegacyCopies({db,subject,plan,assertFrozen:async()=>true,objectId:x=>x});
 assert.deepEqual(db.deleted,[id(1)]);assert.equal(db.rows.medicalreportmaintenancearchives[0].patientId,other);
 assert.equal((await eraseLegacyCopies({db,subject,plan,assertFrozen:async()=>true,objectId:x=>x})).erased,0);
});
test('mixed historical financial copies and unknown collections block without deletion',async()=>{
 const db=database({maintenance_backups:[{_id:id(3),user:{_id:user},transactions:[{user:other}]}],unknown_copy:[{_id:id(4),json:JSON.stringify({patientId:user})}]});
 const plan=await inventoryLegacyCopies(options(db));assert.equal(plan.blockers.length,2);
 await assert.rejects(eraseLegacyCopies({db,subject,plan,assertFrozen:async()=>true,objectId:x=>x}),{code:'LEGACY_PLAN_NOT_VERIFIED'});
 assert.deepEqual(db.deleted,[]);
});
test('cross-tenant snapshots block even with matching owner',async()=>{
 const db=database({annual_plan_correction_backups:[{_id:id(5),original:{patientId:user,tenantId:other}}]});
 const plan=await inventoryLegacyCopies(options(db));assert.equal(plan.blockers[0].code,'CROSS_TENANT_HISTORICAL_COPY');assert.equal(plan.documents.length,0);
});
test('all copies preflight before mutation; changed later snapshot prevents earlier deletion',async()=>{
 const db=database({medicalservicecases:[{_id:id(6),patientId:user},{_id:id(7),patientId:user}]});
 const plan=await inventoryLegacyCopies(options(db));db.rows.medicalservicecases[1].note='changed';
 await assert.rejects(eraseLegacyCopies({db,subject,plan,assertFrozen:async()=>true,objectId:x=>x}),{code:'LEGACY_COPY_CHANGED'});assert.deepEqual(db.deleted,[]);
});
test('failed writer fence and scan limit cannot produce success',async()=>{
 const db=database({medicalservicecases:[{_id:id(8),patientId:user}]});
 const plan=await inventoryLegacyCopies(options(db));
 await assert.rejects(eraseLegacyCopies({db,subject,plan,assertFrozen:async()=>false,objectId:x=>x}),{code:'LEGACY_FENCE_LOST'});
 await assert.rejects(inventoryLegacyCopies({...options(db),maxDocuments:0}),{code:'LEGACY_SCAN_LIMIT_REQUIRES_REVIEW'});assert.deepEqual(db.deleted,[]);
});
