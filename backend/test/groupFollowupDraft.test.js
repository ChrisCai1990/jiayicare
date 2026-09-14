const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, exactDate, fingerprint, createDraft } = require('../src/utils/groupFollowupDraft');
const { consentAllows } = require('../src/utils/wecomArchiveCollector');

test('筛选跟进、临床问题和变更；忽略闲聊与否定跟进', () => {
  assert.equal(classify('谢谢，收到'), null);
  assert.equal(classify('不用提醒我复查'), null);
  assert.ok(classify('下周三联系我复查'));
  assert.ok(classify('报告出来了，帮我看看'));
  assert.equal(classify('胸痛，要不要停药？').kind, '医护跟进');
  assert.equal(classify('复查推迟到下周').kind, '变更核对');
  assert.equal(exactDate('下周三'), null);
  assert.equal(exactDate('2026年2月30日复查'), null);
  assert.equal(exactDate('2026年9月18日复查').toISOString(), '2026-09-18T04:00:00.000Z');
});
test('重复消息按发送人和中国日期去重，不合并不同发言者或不同日期', () => {
  const a = fingerprint('请提醒我复查', 'a', '2026-09-14T00:00:00Z');
  assert.equal(a, fingerprint('请提醒我 复查', 'a', '2026-09-14T01:00:00Z'));
  assert.notEqual(a, fingerprint('请提醒我复查', 'b', '2026-09-14T00:00:00Z'));
  assert.notEqual(a, fingerprint('请提醒我复查', 'a', '2026-09-14T18:00:00Z'));
});
test('缺失、拒绝、未知同意状态或同意之前的消息不得入库', () => {
  const m = {msgtime:2000};
  assert.equal(consentAllows(m, []), false);
  assert.equal(consentAllows(m, [{agree_status:'Agree',status_change_time:1}]), true);
  assert.equal(consentAllows(m, [{agree_status:'Disagree',status_change_time:1}]), false);
  assert.equal(consentAllows(m, [{agree_status:'Agree',status_change_time:3}]), false);
  assert.equal(consentAllows(m, [{agree_status:'Agree'}]), false);
});
test('群消息草稿必须由人工选择成员、日期并确认，重复确认只创建一个正式随访', async t => {
  const {buildFixture} = require('./helpers/serviceGroupFixture');
  const f=buildFixture(),g=f.models.ServiceGroup.rows[0];
  const message={text:'下周三联系我复查',sender:'synthetic-sender',sentAt:'2026-09-14T00:00:00Z',messageId:'synthetic-message'};
  assert.equal(await createDraft(g,message),'created');
  assert.equal(await createDraft(g,message),'duplicate');
  const e=f.models.ServiceGroupEntry.rows[0];
  assert.equal(e.patientId,null);assert.equal(e.dueAt,null);
  assert.equal(f.models.FollowUp.rows.length,0);
  const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
  const send=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/staff/service-groups/${g._id}/entries/${e._id}`,{method:'PATCH',headers:{authorization:'Bearer synthetic-test','content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  assert.equal((await send({version:e.__v,status:'planned'})).status,400);
  assert.equal((await send({version:e.__v,patientId:f.ids.outsider,dueAt:'2026-09-16',status:'planned'})).status,400);
  assert.equal((await send({version:e.__v,patientId:f.ids.patient,dueAt:'2026-09-16',assignedTo:f.ids.staff,status:'planned'})).status,200);
  assert.equal(f.models.FollowUp.rows.length,1);
  assert.equal((await send({version:e.__v,status:'planned'})).status,200);
  assert.equal(f.models.FollowUp.rows.length,1);
});
