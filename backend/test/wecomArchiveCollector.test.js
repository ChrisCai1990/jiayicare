const test=require('node:test'),assert=require('node:assert/strict');
const {tick}=require('../src/utils/wecomArchiveCollector');
function fixture(){
  const state={seq:0},g={_id:'g',chatId:'room',archiveConsent:true,tenantId:null};
  return {state,g,deps:{
    Cursor:{updateOne:async(filter,update)=>{Object.assign(state,update.$set||{});return {matchedCount:1};},findOneAndUpdate:async()=>({...state})},
    Group:{find:()=>({lean:async()=>[g]}),findOne:()=>({lean:async()=>g})},
    archiveApi:async()=>({agreeinfo:[{agree_status:'Agree',status_change_time:1}]}),
    sdk:async()=>({rows:[]}),bridge:async()=>({data:{duplicate:false}}),createDraft:async()=> 'created',
  }};
}
const row=(seq,roomid='room')=>({seq,message:{action:'send',msgtype:'text',msgid:'m'+seq,from:'staff',roomid,msgtime:Date.now(),text:{content:'请提醒我复查'}}});
test('无授权群与拒绝同意不写库；游标仍推进，不能将其他群内容写入当前群',async()=>{
  const f=fixture();let writes=0;
  f.deps.sdk=async()=>({rows:[row(1,'unbound'),row(2)]});
  f.deps.archiveApi=async()=>({agreeinfo:[{agree_status:'Disagree',status_change_time:1}]});
  f.deps.bridge=async()=>{writes++;};
  await tick(f.deps);assert.equal(writes,0);assert.equal(f.state.seq,2);assert.equal(f.state.counters.skippedScope,1);assert.equal(f.state.counters.skippedConsent,1);
});
test('桥接失败不跨过消息；恢复重试后只推进一次',async()=>{
  const f=fixture();let calls=0;
  f.deps.sdk=async()=>({rows:[row(1)]});
  f.deps.bridge=async()=>{calls++;throw Error('archive_bridge_503');};
  await assert.rejects(tick(f.deps),/archive_bridge_503/);assert.equal(f.state.seq,0);
  f.deps.bridge=async()=>{calls++;return {data:{duplicate:true}};};
  await tick(f.deps);assert.equal(f.state.seq,1);assert.equal(calls,2);assert.equal(f.state.counters.stored,0);
});
test('草稿失败后重试，即使消息已收件也补齐草稿',async()=>{
  const f=fixture();process.env.SERVICE_GROUP_FOLLOWUP_DRAFT_ENABLED='true';
  f.deps.sdk=async()=>({rows:[row(1)]});f.deps.createDraft=async()=>{throw Error('draft-db-failed');};
  try{
    await assert.rejects(tick(f.deps));assert.equal(f.state.seq,0);
    f.deps.createDraft=async()=> 'created';f.deps.bridge=async()=>({data:{duplicate:true}});
    await tick(f.deps);assert.equal(f.state.seq,1);assert.equal(f.state.counters.draftCreated,1);
  }finally{delete process.env.SERVICE_GROUP_FOLLOWUP_DRAFT_ENABLED;}
});
