const test=require('node:test'),assert=require('node:assert/strict');
const {urlToKey}=require('../src/utils/oss');
const {normalizeMedicationAttachments,canonicalUrl}=require('../src/utils/medicationAttachmentStorage');
process.env.OSS_BUCKET='test-medical-bucket';
const patient='aaaaaaaaaaaaaaaaaaaaaaaa',id='bbbbbbbbbbbbbbbbbbbbbbbb';
const original='https://test-medical-bucket.oss-cn-beijing.aliyuncs.com/reports/prescription.png';
const preview=`/api/staff/patients/${patient}/medications/${id}/attachments/0/preview?token=expired-test-token`;
function records(imageUrls=[original]){return{findOne(filter){assert.equal(filter.user,patient);return{select(){return{lean:async()=>({imageUrls})}}}}}}
test('saving an expired display URL retains the original attachment; repeated edit-save remains stable',async()=>{
 let stored=[original];for(let i=0;i<3;i++)stored=await normalizeMedicationAttachments([preview],patient,records(stored));assert.deepEqual(stored,[original]);
});
test('same-patient again-use can copy original attachments but cross-patient references cannot',async()=>{
 assert.deepEqual(await normalizeMedicationAttachments([preview],patient,records()),[original]);
 await assert.rejects(normalizeMedicationAttachments([preview.replace(patient,'cccccccccccccccccccccccc')],patient,records()),e=>e.statusCode===400);
});
test('missing attachments and self-referential corrupted URLs are rejected before save',async()=>{
 await assert.rejects(normalizeMedicationAttachments([preview],patient,records([])),e=>e.statusCode===400);
 await assert.rejects(normalizeMedicationAttachments([preview],patient,records([preview])),e=>e.statusCode===400);
});
test('signed OSS queries are never part of object keys or stored attachment references',async()=>{
 const signed=original+'?Expires=123&Signature=test#fragment';assert.equal(urlToKey(signed),'reports/prescription.png');assert.equal(canonicalUrl(signed),original);
 assert.deepEqual(await normalizeMedicationAttachments([signed],patient,records()),[original]);
 assert.equal(urlToKey('https://example.test/path/test-medical-bucket.fake/a.png'),null);assert.equal(urlToKey(preview),null);
});
test('removal, order and six-attachment limit are preserved',async()=>{
 assert.deepEqual(await normalizeMedicationAttachments([],patient,records()),[]);
 const values=Array.from({length:8},(_,i)=>original.replace('.png',i+'.png'));assert.deepEqual(await normalizeMedicationAttachments(values,patient,records()),values.slice(0,6));
});
