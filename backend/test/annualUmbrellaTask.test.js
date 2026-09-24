const test = require('node:test');
const assert = require('node:assert/strict');
const { isAnnualUmbrellaRecord, obsoleteAnnualUmbrellaQuery } = require('../src/utils/annualUmbrellaTask');

test('只取消系统生成的年度统筹占位，不取消具体协同任务', () => {
  assert.equal(isAnnualUmbrellaRecord({ items: '统筹2026年度健康管理方案协同任务' }), true);
  assert.equal(isAnnualUmbrellaRecord({ standardPlanName: '统筹2026年度健康管理方案协同任务', items: '其他' }), true);
  assert.equal(isAnnualUmbrellaRecord({ items: '陪同客户完成心内科就医' }), false);
  assert.equal(isAnnualUmbrellaRecord({ items: '统筹2026年度健康管理方案协同任务：安排检查' }), false);
  assert.equal(obsoleteAnnualUmbrellaQuery.$or[1].sourceType, 'scheduled');
  assert.equal(obsoleteAnnualUmbrellaQuery.$or[1].theme.test('协同执行 · 统筹2026年度健康管理方案协同任务'), true);
  assert.equal(obsoleteAnnualUmbrellaQuery.$or[1].theme.test('协同执行 · 心内科检查'), false);
});
