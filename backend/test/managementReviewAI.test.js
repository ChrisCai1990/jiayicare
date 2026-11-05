const test=require('node:test'),assert=require('node:assert/strict');
const ai=require('../src/utils/managementReviewAI');
const contribution={state:'unknown',...Object.fromEntries(ai.fields.map(k=>[k,'来源不足，待岗位核实']))};
test('AI output must contain all requested roles and fields',()=>{
 const raw={focus:'核对本月行动',contributions:{nutritionist:contribution}};
 assert.deepEqual(ai.parseDraft(JSON.stringify(raw),['nutritionist']),raw);
 assert.throws(()=>ai.parseDraft(JSON.stringify(raw),['nutritionist','healthManager']));
 assert.throws(()=>ai.parseDraft(JSON.stringify({...raw,contributions:{nutritionist:{...contribution,state:'approved'}}}),['nutritionist']));
 assert.throws(()=>ai.parseDraft('not json',['nutritionist']));
});
test('evidence overflow is marked without silently dropping later categories',()=>{const packet=ai.evidencePacket({plans:[{content:'x'.repeat(15000)}],feedback:[{content:'尚未完成检查'}]});assert.ok(packet.plans[0].notice);assert.equal(packet.feedback[0].content,'尚未完成检查')});
test('draft generation keeps submitted roles intact, stores draft only, and acquires lock before AI',async()=>{
 const row={_id:'review',__v:2,status:'collecting',label:'8月',start:'2026-08-01',end:'2026-08-31',focus:'待AI整理本期重点',contributions:{healthManager:{status:'submitted',execution:'已核实执行'}}};let writes=[],calls=0;
 const Review={findOneAndUpdate:async(filter,update)=>{writes.push({filter,update});return writes.length===1?{__v:3}:{...row,...update.$set}},updateOne:async()=>{}};
 const result=await ai.generate({Review,user:{_id:'patient'},row,staff:{_id:'staff'},source:{},roles:['nutritionist'],chat:async()=>{calls++;return JSON.stringify({focus:'核实饮食行动',contributions:{nutritionist:contribution}})}});
 assert.equal(calls,1);assert.equal(result.status,'collecting');assert.equal(result.contributions.nutritionist.status,'draft');assert.equal(result.contributions.healthManager.status,'submitted');assert.equal(writes[1].filter.__v,3);assert.ok(writes[1].filter['generation.token']);
 await assert.rejects(ai.generate({Review:{findOneAndUpdate:async()=>null},user:{},row,staff:{},roles:[],chat:async()=>{throw Error('must not call')}}),/正在生成/);
});
test('AI failure releases lock and does not overwrite existing drafts',async()=>{let failure;await assert.rejects(ai.generate({Review:{findOneAndUpdate:async()=>({__v:1}),updateOne:async(f,u)=>{failure=u}},user:{_id:'p'},row:{_id:'r',__v:0,status:'collecting'},staff:{_id:'s'},source:{},roles:['nutritionist'],chat:async()=>{throw Error('timeout')}}),/timeout/);assert.equal(failure.$set.generation.status,'failed');assert.equal(failure.$set.contributions,undefined)});
test('summary prompt contains submitted roles, not raw unreviewed sources',async()=>{let prompt;const row={_id:'r',__v:1,status:'advisor_review',roles:['nutritionist'],contributions:{nutritionist:{status:'submitted',execution:'专业人员确认的内容'}}};let n=0;
 const result=await ai.generate({Review:{findOneAndUpdate:async(f,u)=>++n===1?{__v:2}:u.$set,updateOne:async()=>{}},user:{_id:'p'},row,staff:{_id:'s'},roles:row.roles,summary:true,source:{unreviewed:'must not use'},chat:async m=>{prompt=m[0].content;return JSON.stringify({summary:'待顾问审核的汇总',nextPlan:''})}});
 assert.ok(prompt.includes('专业人员确认的内容'));assert.ok(!prompt.includes('must not use'));assert.equal(result.summary,'待顾问审核的汇总');assert.equal(result.status,undefined);
});
