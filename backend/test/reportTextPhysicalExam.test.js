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
  assert.equal(parsed.items.length, 22);
  assert.equal(parsed.items[0].name, '身高(cm)');
  assert.equal(parsed.items[0].itemType, 'data');
  assert.equal(parsed.items[0].value, '176.0');
  assert.equal(parsed.items[8].findings, '≥1');
  assert.equal(parsed.items[17].name, '耳部检查');
  assert.equal(parsed.items[17].sourceSection, '【耳鼻喉科体检】');
  assert.equal(parsed.items.at(-1).name, '是否吸烟');
  assert.ok(parsed.items.every(item => item.manualReviewStatus === 'pending' && item.sourcePage === 4));
  assert.ok(parsed.items.every(item => !/检查医生|报告时间/.test(item.name)));

  const reviewed = parsed.items.filter(item => ['右眼裸视力', '左眼裸视力'].includes(item.name))
    .map(item => ({ ...item, manualReviewStatus: 'reviewed' }));
  const missing = filterMissingReportItems(reviewed, parsed.items, { preserveDistinctMeasuredSections: true });
  const merged = mergeSupplementItems(reviewed, missing, { preserveDistinctMeasuredSections: true });
  assert.equal(merged.added.length, 20);
  assert.equal(merged.items.filter(item => item.manualReviewStatus === 'reviewed').length, 2);
});

test('unstructured or ambiguous page text cannot enter the local draft path', () => {
  const text = `【眼科体检】\n眼睑 健康\n结膜 正常\n检查医生 某某\n【耳鼻喉科体检】\n耳部检查 未见明显异常`;
  const parsed = parseTextPhysicalExam(text, 4);
  assert.equal(parsed.supported, false);
  assert.deepEqual(parsed.items, []);
  assert.throws(() => parseTextPhysicalExam(text, 0), /页码/);
});

test('basic measurements and general-medicine findings are kept as distinct pending rows', () => {
  const layout = `【一般项目(基础)】
身高(cm)                         167.5
体重(Kg)                         75.4
体重指数(BMI)                      26.9
腰围(cm)                         91
血压(mmHg)                       109/72
脉搏(次/分)                        68
跌倒评分                           无
检查医生：某某            报告时间：2024-10-4
【全科医学检查】
手术史其他                          无
是否吸烟                           吸烟
每日吸烟量（支/日）                     20+
是否饮酒                           饮酒
饮酒情况                           偶尔
心脏                             未见明显异常
胸部                             未见明显异常
腹部                             未见明显异常
神经系统                           未见明显异常
皮肤                             未见明显异常
邵逸夫医院体检报告[体检检查内容]                                      Page4/19`;
  const parsed = parseTextPhysicalExam(layout, 4);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 17);
  assert.deepEqual(parsed.items.slice(0, 7).map(item => item.itemType), Array(7).fill('data'));
  assert.equal(parsed.items.find(item => item.name === '血压(mmHg)').value, '109/72');
  assert.equal(parsed.items.find(item => item.name === '每日吸烟量（支/日）').findings, '20+');
  assert.ok(parsed.items.slice(7).every(item => item.itemType === 'imaging'));
  assert.ok(parsed.items.every(item => item.manualReviewStatus === 'pending' && item.status === 'unknown'));
});
