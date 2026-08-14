const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPediatricAge,
  sanitizePediatricBodyCompositionPage,
  mergePediatricBodyCompositionRetry,
} = require('../src/utils/pediatricBodyComposition');

test('年龄分流只把未满18岁识别为儿童', () => {
  assert.equal(isPediatricAge(10.5), true);
  assert.equal(isPediatricAge(17.99), true);
  assert.equal(isPediatricAge(18), false);
  assert.equal(isPediatricAge(undefined), false);
});

test('儿童示例提取五项并按各自参考范围计算状态', () => {
  const rows = [
    ['体重', '24.6', '27-36.5'],
    ['钙质', '0.61', '0.56-0.67'],
    ['蛋白质', '4.6', '4.4-5.3'],
    ['脂肪量', '1.9', '5.1-9.5'],
    ['肌肉量', '21.0', '20.7-24.8'],
  ].map(([name, value, referenceRange]) => ({ name, value, unit: 'KG', referenceRange }));
  const result = sanitizePediatricBodyCompositionPage(rows);
  assert.deepEqual(result.map(item => item.name), ['体重', '钙质', '蛋白质', '脂肪量', '肌肉量']);
  assert.deepEqual(result.map(item => item.status), ['abnormal', 'normal', 'normal', 'abnormal', 'normal']);
  assert.ok(result.every(item => item.sourceSection === '儿童人体成分分析' && item.unit === 'kg'));
});

test('儿童截图中的五项目标保持各自卡片数值并忽略水分及代谢', () => {
  const rows = [
    { name: '体重', value: '24.6', unit: 'kg', referenceRange: '27.0-36.5', sourceRow: '体重 24.6 27.0 36.5' },
    { name: '钙质', value: '0.61', unit: 'kg', referenceRange: '0.56-0.67', sourceRow: '钙质 0.61 0.56 0.67' },
    { name: '蛋白质', value: '4.6', unit: 'kg', referenceRange: '4.4-5.3', sourceRow: '蛋白质 4.6 4.4 5.3' },
    { name: '脂肪量', value: '1.9', unit: 'kg', referenceRange: '5.1-9.5', sourceRow: '脂肪量 1.9 5.1 9.5' },
    { name: '肌肉量', value: '21.0', unit: 'kg', referenceRange: '20.7-24.8', sourceRow: '肌肉量 21.0 20.7 24.8' },
    { name: '身体水分', value: '16.4', unit: 'kg', referenceRange: '16.2-19.5', sourceRow: '身体水分 16.4 16.2 19.5' },
    { name: '基础代谢', value: '859.0', unit: 'kcal', referenceRange: '850.0-946.0', sourceRow: '基础代谢 859.0 850.0 946.0' },
  ];
  const result = sanitizePediatricBodyCompositionPage(rows, true);
  assert.deepEqual(result.map(({ name, value }) => [name, value]), [
    ['体重', '24.6'],
    ['钙质', '0.61'],
    ['蛋白质', '4.6'],
    ['脂肪量', '1.9'],
    ['肌肉量', '21.0'],
  ]);
});

test('儿童复核不会把成人项目混入五项结果', () => {
  const result = mergePediatricBodyCompositionRetry(
    [{ name: '体脂率', value: '8', unit: '%' }, { name: '备注', findings: '儿童报告' }],
    [{ name: '脂肪量', value: '1.9', unit: 'kg', referenceRange: '5.1-9.5', sourceRow: '脂肪量 1.9 5.1 9.5' }],
  );
  assert.equal(result.some(item => item.name === '脂肪量'), true);
  assert.equal(result.some(item => item.name === '体脂率'), false);
  assert.equal(result.some(item => item.name === '肌肉量'), false);
});

test('儿童专项复核拒绝相邻行串值和缺少原行证据的项目', () => {
  const result = mergePediatricBodyCompositionRetry([], [
    { name: '蛋白质', value: '1.9', unit: 'kg', referenceRange: '5.1-9.5', sourceRow: '脂肪量 1.9 5.1 9.5' },
    { name: '脂肪量', value: '21.0', unit: 'kg', referenceRange: '20.7-24.8', sourceRow: '肌肉量 21.0 20.7 24.8' },
    { name: '钙质', value: '0.61', unit: 'kg', referenceRange: '0.56-0.67', sourceRow: '钙质 0.61 0.56 0.67' },
    { name: '肌肉量', value: '20.7', unit: 'kg', referenceRange: '20.7-24.8' },
  ]);
  assert.deepEqual(result.map(item => item.name), ['钙质']);
});
