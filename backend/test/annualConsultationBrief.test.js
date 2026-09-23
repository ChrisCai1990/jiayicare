const test = require('node:test'), assert = require('node:assert/strict');
const { consultationBrief } = require('../../shared/annualConsultationBrief.cjs');
test('既有顾问原因、依据、项目及明确沟通内容原样带出', () => {
  const b = consultationBrief({formData:{serviceRequest:{itemSnapshot:{reason:'稳定性随访',basisSummary:'2026-06-01：6×4mm，较前无变化',items:'肾脏彩超',communicationContent:'请核对既往影像'}}}}, {});
  assert.equal(b.reason,'稳定性随访'); assert.equal(b.basis,'2026-06-01：6×4mm，较前无变化'); assert.equal(b.communication,'请核对既往影像'); assert.equal(b.missingReason,false);
});
test('兼容旧随访标签和多行原文，不将注意事项串成依据', () => {
  const b = consultationBrief({}, {plannedContent:'原因：核对异常\n设置依据：2026-06检查\n较前无变化\n项目：检查甲\n检查乙\n注意事项：提前联系'});
  assert.equal(b.basis,'2026-06检查\n较前无变化'); assert.equal(b.items,'检查甲\n检查乙'); assert.equal(b.communication,'');
});
test('派单后只用冻结交接，不读取更改后的顾问计划', () => {
  const b = consultationBrief({annualDispatch:{itemSnapshot:{},advisorPlanText:'原因：原目的\n项目：原项目'},formData:{serviceRequest:{itemSnapshot:{reason:'后来目的'}}}}, {plannedContent:'原因：后来目的'});
  assert.equal(b.reason,'原目的'); assert.equal(b.items,'原项目');
});
test('缺失依据不臆造病情，忽略非文字字段并消除同文重复', () => {
  assert.equal(consultationBrief({formData:{serviceRequest:{itemSnapshot:{reason:{text:'不可猜测'}}}}},{}).missingReason,true);
  assert.equal(consultationBrief({formData:{serviceRequest:{itemSnapshot:{reason:'相同',basisSummary:'相同'}}}},{}).basis,'');
});
