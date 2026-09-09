const test = require('node:test');
const assert = require('node:assert/strict');
const {workbench,draft} = require('../src/utils/serviceGroupWorkbench');
test('workbench excludes drafts, cancelled work and other staff from personal reminders',()=>{
  const now = new Date('2026-09-09T00:00:00Z');
  const entries = [
    {kind:'task',status:'planned',assignedTo:'a',title:'核对预约',dueAt:'2026-09-08'},
    {kind:'task',status:'draft',assignedTo:'a',title:'未确认',dueAt:'2026-09-08'},
    {kind:'task',status:'planned',assignedTo:'b',title:'他人',dueAt:'2026-09-08'},
    {kind:'task',status:'cancelled',assignedTo:'a',title:'已取消',dueAt:'2026-09-08'},
  ];
  assert.deepEqual(workbench(entries,'a',now).reminders.map(e=>e.title),['核对预约']);
  const d=draft('handoff',{groupName:'演示家庭',entries,staffId:'a',now});
  assert.match(d.content,/未确认草稿/);
  assert.doesNotMatch(d.content,/- 未确认|已取消/);
  assert.doesNotMatch(draft('reply',{entries,now}).content,/核对预约|他人/);
});
