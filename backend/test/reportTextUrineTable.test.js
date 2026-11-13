const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextUrineTable } = require('../src/utils/reportTextUrineTable');
const { filterMissingReportItems, mergeSupplementItems } = require('../src/utils/reportPageSupplement');

test('two-column urine table retains both abnormal rows and all right-column results', () => {
  const layout = `        『尿液干化学分析』
     名称                结果      参考范围
【尿干化学】            .                            尿液颜色                     黄色
尿液浊度              清亮                           葡萄糖                      阴性        阴性
胆红素               阴性         阴性                酮体                       阴性        阴性
比重              H 1.033      1.003-1.030       潜血                       阴性        阴性
pH                5.5        4.5-8.0           蛋白质                   H 弱阳性        阴性
尿胆原               阴性         阴性,弱阳性            亚硝酸盐                     阴性        阴性
白细胞酯酶             阴性         阴性                【尿有形成分分析】                .
红细胞               10.8       0.0-18.0/μL       白细胞                      5.5       0.0-13.0/μL
上皮细胞              2.8        0.0-8.0/μL        小圆上皮细胞                   2.2
管型                0.68       0.00-1.00/μL      病理管型                     0.00
细菌                33.7       0.0-43.0/μL       结晶                       66.6
     备注： 复检结果与有形成分定量分析相符
        『葡萄糖/血脂常规』`;
  const parsed = parseTextUrineTable(layout, 9);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 20);
  assert.equal(parsed.items.find(item => item.name === '比重').value, '1.033');
  assert.equal(parsed.items.find(item => item.name === '比重').status, 'abnormal');
  assert.equal(parsed.items.find(item => item.name === '蛋白质').value, '弱阳性');
  assert.equal(parsed.items.find(item => item.name === '蛋白质').status, 'abnormal');
  assert.equal(parsed.items.find(item => item.name === '结晶').value, '66.6');
  const existing = parsed.items.filter(item => ['尿液颜色', '尿液浊度', '胆红素', 'pH', '尿胆原', '白细胞酯酶', '红细胞', '上皮细胞', '管型', '细菌'].includes(item.name))
    .map(item => ({ ...item, manualReviewStatus: 'reviewed' }));
  const missing = filterMissingReportItems(existing, parsed.items, { preserveDistinctMeasuredSections: true });
  assert.equal(missing.length, 10);
  const merged = mergeSupplementItems(existing, missing, { preserveDistinctMeasuredSections: true });
  assert.equal(merged.added.length, 10);
  assert.equal(merged.items.filter(item => item.manualReviewStatus === 'reviewed').length, 10);
});

test('unanchored or unrelated pages cannot enter the urine table path', () => {
  assert.equal(parseTextUrineTable('尿常规\n比重 1.033\n蛋白质 弱阳性', 9).supported, false);
  assert.throws(() => parseTextUrineTable('『尿液干化学分析』', 0), /页码/);
});
