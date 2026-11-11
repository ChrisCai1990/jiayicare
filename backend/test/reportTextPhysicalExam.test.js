const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextPhysicalExam } = require('../src/utils/reportTextPhysicalExam');
const { filterMissingReportItems, mergeSupplementItems } = require('../src/utils/reportPageSupplement');

test('eye and ENT printed rows become separate pending review candidates', () => {
  const layout = `【一般项目(基础)】
身高(cm)                 176.0
【眼科体检】
初步印象                 健康
右眼裸视力               1.2
左眼裸视力               1.2
眼睑                     健康
结膜                     健康
角膜                     正常
前房清                   是
周边前房深度右           ≥1
周边前房深度左           ≥1
虹膜                     健康
右晶体                   透明
左晶体                   透明
右玻璃体                 清
左玻璃体                 清
眼底                     正常
眼科建议                 门诊随诊,定期复查
检查医生：某某            报告时间：2025-02-13
【耳鼻喉科体检】
耳部检查                 未见明显异常
鼻部检查                 鼻腔粘膜充血
咽部检查                 未见明显异常
ENT建议                  门诊随诊,定期复查
【全科医学检查】
是否吸烟                 吸烟`;
  const parsed = parseTextPhysicalExam(layout, 4);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 20);
  assert.equal(parsed.items[0].name, '初步印象');
  assert.equal(parsed.items[7].findings, '≥1');
  assert.equal(parsed.items[16].name, '耳部检查');
  assert.equal(parsed.items[16].sourceSection, '【耳鼻喉科体检】');
  assert.ok(parsed.items.every(item => item.itemType === 'imaging'
    && item.manualReviewStatus === 'pending' && item.sourcePage === 4));
  assert.ok(parsed.items.every(item => !/检查医生|报告时间|是否吸烟/.test(item.name)));

  const reviewed = parsed.items.filter(item => ['右眼裸视力', '左眼裸视力'].includes(item.name))
    .map(item => ({ ...item, manualReviewStatus: 'reviewed' }));
  const missing = filterMissingReportItems(reviewed, parsed.items, { preserveDistinctMeasuredSections: true });
  const merged = mergeSupplementItems(reviewed, missing, { preserveDistinctMeasuredSections: true });
  assert.equal(merged.added.length, 18);
  assert.equal(merged.items.filter(item => item.manualReviewStatus === 'reviewed').length, 2);
});

test('unstructured or ambiguous page text cannot enter the local draft path', () => {
  const text = `【眼科体检】\n眼睑 健康\n结膜 正常\n检查医生 某某\n【耳鼻喉科体检】\n耳部检查 未见明显异常`;
  const parsed = parseTextPhysicalExam(text, 4);
  assert.equal(parsed.supported, false);
  assert.deepEqual(parsed.items, []);
  assert.throws(() => parseTextPhysicalExam(text, 0), /页码/);
});
