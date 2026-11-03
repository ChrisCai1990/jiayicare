const test = require('node:test');
const assert = require('node:assert/strict');
const { consultationTodos } = require('../src/utils/consultationTodos');
const { visibleTodo } = require('../src/utils/humanWorkbench');
test('confirmed referral reaches only assigned manager; booking removes pending task', () => {
  const row = {_id:'case',patientId:{_id:'patient',name:'测试'},managerId:'manager',advisorId:'advisor',plannerId:'planner',status:'planner',expertsConfirmedAt:new Date()};
  const manager = {_id:'manager',role:'healthManager'};
  const todos = consultationTodos([row],manager);
  assert.equal(todos.length,1);
  assert.equal(todos[0].label,'专家时间待预约');
  assert.equal(todos[0].link,'/expert-consultations?caseId=case');
  assert.equal(visibleTodo(todos[0],manager,()=>false),true);
  assert.equal(consultationTodos([row],{_id:'other',role:'healthManager'}).length,0);
  assert.equal(consultationTodos([row],{_id:'planner',role:'healthPlanner'}).length,0);
  assert.equal(consultationTodos([{...row,status:'expert'}],manager).length,0);
  assert.equal(consultationTodos([{...row,expertsConfirmedAt:null}],manager).length,0);
  assert.equal(consultationTodos([{...row,expertsConfirmedAt:null}],{_id:'advisor',role:'familyDoctor'}).length,1);
});

test('dispatched experts each get a scoped reply task, removed only after their own reply',()=>{
 const row={_id:'c',status:'expert',patientId:{_id:'p',name:'测试'},members:[{staffId:'a'},{staffId:'b',repliedAt:new Date()}]};
 const staff={_id:'a',role:'specialist'};
 const todos=consultationTodos([row],staff);
 assert.equal(todos.length,1);assert.equal(visibleTodo(todos[0],staff,()=>false),true);
 assert.equal(consultationTodos([row],{_id:'b',role:'specialist'}).length,0);
 assert.equal(consultationTodos([row],{_id:'other',role:'specialist'}).length,0);
});
