const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../src/utils/inAppGroupMaterials');
test('medical classification checks every page, excludes unrecognized photos and supports whole checkups',async t=>{
 const pdf=require('../src/utils/pdf');
 const original=pdf.fetchReportBuffers;
 pdf.fetchReportBuffers=async()=>[Buffer.from('page1'),Buffer.from('page2')];
 t.after(()=>{pdf.fetchReportBuffers=original});
 const report={_id:'synthetic',documentCategory:'physical_exam',mimeType:'image/png'};
 let count=0;
 assert.equal(await policy.checkCategory(report,async()=>JSON.stringify({category:++count===1?'lab_report':'exam_report'})),true);
 assert.equal(count,2);
 count=0;
 assert.equal(await policy.checkCategory(report,async()=>JSON.stringify({category:++count===1?'physical_exam':'other'})),false);
 assert.equal(count,2);
 assert.equal(await policy.checkCategory({...report,documentCategory:'prescription_order'},async()=>'{"category":"lab_report"}'),false);
 assert.equal(await policy.checkCategory(report,async()=>'not json'),false);
});
test('invalid payloads cannot submit chat text or forged categories for recognition',()=>{
 const base={requestId:'material_testing_123456',category:'physical_exam'};
 assert.throws(()=>policy.validate({...base,files:['血压120/80']}));
 assert.throws(()=>policy.validate({...base,files:['data:image/jpeg;base64,aGVsbG8=']}));
 assert.throws(()=>policy.validate({...base,category:'__proto__',files:[]}));
 assert.throws(()=>policy.validate({...base,files:Array(10).fill('invalid')}));
 assert.equal(policy.statusOf({aiStatus:'pending',audit_status:'unaudited'}),'待健管专员核对');
});
