const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextResultFirstLab } = require('../src/utils/reportTextResultFirstLab');

test('result-first vaginal table reads current result without borrowing prior result', () => {
  const layout = `白带生化
分析项目                 检查结果             参考值             单位         上次检查结果
滴虫TRCH                 未检到               未检到                          未检到
清洁度                   II                   I·II              度           II
线索细胞                 未检到               未检到                          未检到
白细胞                   0-5                  0-15              /HPF         0-5
上皮细胞                 少量 ↓               中量·大量         /HPF         中量
杆菌                     大量                 中量·大量         /HPF         大量
杂菌                     少量                 无·少量           /HPF         中量
唾液酸苷酶               阴性(-)              阴性(-)                         阴性(-)
报告者：某某`;
  const result = parseTextResultFirstLab(layout, 12);
  assert.equal(result.supported, true);
  assert.equal(result.items.length, 8);
  assert.equal(result.items[0].unit, '');
  assert.equal(result.items.find(item => item.name === '白细胞').unit, '/HPF');
  assert.equal(result.items.find(item => item.name === '上皮细胞').status, 'abnormal');
  assert.equal(result.items.find(item => item.name === '上皮细胞').value, '少量 ↓');
  assert.equal(result.items[0].sourceSection, '白带生化');
});

test('unstructured text does not create result-first lab rows', () => {
  const result = parseTextResultFirstLab('白带生化\n白细胞 0-5\n唾液酸苷酶 阴性', 12);
  assert.equal(result.supported, false);
  assert.deepEqual(result.items, []);
});
