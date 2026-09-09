const test=require('node:test'),assert=require('node:assert/strict');
test('group name lookup requires membership and returns only the name',async(t)=>{
  const old=global.fetch,oldCorp=process.env.WECOM_CORP_ID,oldSecret=process.env.WECOM_APP_SECRET;
  process.env.WECOM_CORP_ID='test';process.env.WECOM_APP_SECRET='synthetic';
  t.after(()=>{global.fetch=old;if(oldCorp===undefined)delete process.env.WECOM_CORP_ID;else process.env.WECOM_CORP_ID=oldCorp;if(oldSecret===undefined)delete process.env.WECOM_APP_SECRET;else process.env.WECOM_APP_SECRET=oldSecret;});
  let member=true;
  global.fetch=async(url,options)=>({ok:true,json:async()=>url.includes('gettoken')?{access_token:'synthetic'}:{group_chat:{name:'原群名',owner:'other',member_list:[{type:1,userid:member?'self':'other'}]}}});
  const {chatName}=require('../src/utils/serviceGroupWecom');
  assert.deepEqual(await chatName('wr_test','self'),{name:'原群名'});
  member=false;await assert.rejects(chatName('wr_test','self'),/不在该群/);
  await assert.rejects(chatName('bad/chat','self'));
  await assert.rejects(chatName('wr_test',''));
});
