const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/routes/visitorLeads'), 'utf8');
const start = source.indexOf('    const row = await lead(req), status = req.body.status;');
const end = source.indexOf('    res.json({ success: true, data: saved });', start);
async function update(row, status, note, conflict = false) {
  let write;
  await vm.runInNewContext(`(async () => { ${source.slice(start, end)} })()`, {
    req: { body: { status, contactNote: note, baseUpdatedAt: row.updatedAt.toISOString() }, staff: { _id:'actor', name:'测试规划师' } },
    lead: async () => row, scope: () => ({tenantId:null}), normalizeText: s => s,
    fail: message => { throw Error(message) },
    Lead: { findOneAndUpdate: (filter, body) => { write = {filter, body}; return {lean: async () => conflict ? null : body.$set} } },
  });
  return write;
}
test('contact history preserves legacy content and original contact time when closing/reopening', async () => {
  const at = new Date('2026-09-28T02:00:00Z');
  const row = {_id:'lead', status:'contacted', contactNote:'第一次联系', contactedAt:at, updatedAt:at};
  const closed = await update(row, 'closed', '客户暂不需要');
  assert.equal(closed.body.$set.contactEvents.length, 2);
  assert.equal(closed.body.$set.contactEvents[0].note, '第一次联系');
  assert.equal(closed.body.$set.contactEvents[0].at, at);
  assert.equal(closed.body.$set.contactEvents[1].actorId, 'actor');
  assert.ok(!('contactedAt' in closed.body.$set));
  assert.equal(closed.filter.updatedAt, at);
  const reopened = await update({...row, ...closed.body.$set}, 'new', '客户重新咨询');
  assert.equal(reopened.body.$set.contactEvents.length, 3);
  assert.ok(!('contactedAt' in reopened.body.$set));
  const contacted = await update({...row, ...reopened.body.$set}, 'contacted', '再次电话沟通');
  assert.equal(contacted.body.$set.contactEvents.length, 4);
  assert.equal(contacted.body.$set.contactedAt, contacted.body.$set.contactEvents[3].at);
  await assert.rejects(update(row, 'contacted', '冲突提交', true), /刚刚发生变化/);
});


test('automatic customer match uses exact phone and retains tenant, visibility and archive filters', async () => {
  const start=source.indexOf("    const row = await lead(req);",source.indexOf("'/visitor-leads/:id/customer-match'"));
  const end=source.indexOf("  }));",start);
  let filter, output;
  await vm.runInNewContext(`(async () => { ${source.slice(start,end)} })()`,{
    req:{staff:{_id:'planner'}}, lead:async()=>({phone:'19900000000'}),
    getVisiblePlanPatientIds:async()=>['allowed'], scope:()=>({tenantId:'tenant'}),
    User:{find:value=>{filter=value;return {select:()=>({lean:async()=>[]})}}},
    res:{json:value=>{output=value}},
  });
  assert.equal(filter.phone,'19900000000');assert.equal(filter.tenantId,'tenant');
  assert.equal(filter._id.$in[0],'allowed');assert.equal(filter.isDeleted.$ne,true);
  assert.equal(output.data.length,0);
});
