const test=require('node:test'),assert=require('node:assert/strict');
const {assertPlanVersion}=require('../src/utils/annualPlanVersion');
test('旧页面或旧客户端不能覆盖研判补录；刷新后的版本可保存',()=>{
 const plan={updatedAt:new Date('2026-09-30T10:00:00Z'),supplementRevisions:[{status:'applied'}]};
 for(const version of [undefined,null,'2026-09-30T09:00:00.000Z']) assert.throws(()=>assertPlanVersion(plan,version),e=>e.statusCode===409);
 assert.doesNotThrow(()=>assertPlanVersion(plan,plan.updatedAt.toISOString()));
 assert.doesNotThrow(()=>assertPlanVersion(null,null));
 assert.throws(()=>assertPlanVersion(null,plan.updatedAt.toISOString()));
});
