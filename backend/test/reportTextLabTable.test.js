const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextLabTable } = require('../src/utils/reportTextLabTable');
const { filterMissingReportItems, mergeSupplementItems } = require('../src/utils/reportPageSupplement');

test('text-layer transcription includes a breath result, quantitative labs and a negative urine result', () => {
  const layout = `呼气试验
项目名称               检查结果
碳13呼气试验(空腹)     DOB=-1.3, 阴性
甲状腺功能七项
项目名称               检查结果       提示   参考范围       单位
促甲状腺激素           1.158                0.35-5.10     mIU/L
三碘甲状腺原氨酸       1.49                 0.89-2.49     nmol/L
甲状腺素               87.86                64.4-186.6   nmol/L
游离甲状腺素           13.03                6.44-18.02   pmol/L
游离三碘甲状腺原氨酸   4.51                 2.76-6.45    pmol/L
抗甲状腺过氧化物酶抗体 <0.25                0.00-9.00    IU/mL
抗甲状腺球蛋白抗体     <0.90                0.90-4.00    IU/mL
本次结果仅对本标本负责
尿常规(普通)
项目名称               检查结果       提示   参考范围       单位
酸碱度                 6.5                  5.0-7.5
亚硝酸盐               阴性                 阴性`;
  const parsed = parseTextLabTable(layout, 4);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 10);
  assert.equal(parsed.items[0].name, '碳13呼气试验(空腹)');
  assert.equal(parsed.items[0].value, 'DOB=-1.3, 阴性');
  assert.equal(parsed.items[0].status, 'normal');
  assert.equal(parsed.items[0].sourceSection, '呼气试验');
  assert.equal(parsed.items[6].value, '<0.25');
  assert.equal(parsed.items[6].status, 'unknown');
  assert.equal(parsed.items[9].value, '阴性');
  assert.equal(parsed.items[9].referenceRange, '阴性');
  assert.equal(parsed.items[9].status, 'normal');
  const existing = parsed.items.slice(8).map(item => ({ ...item, manualReviewStatus: 'reviewed' }));
  const missing = filterMissingReportItems(existing, parsed.items, { preserveDistinctMeasuredSections: true });
  assert.equal(missing.length, 8);
  const merged = mergeSupplementItems(existing, missing, { preserveDistinctMeasuredSections: true });
  assert.equal(merged.added.length, 8);
  assert.equal(merged.items.filter(item => item.manualReviewStatus === 'reviewed').length, 2);
});

test('text-layer parser keeps abnormal marker and ECG narrative pending review', () => {
  const layout = `血常规
项目名称        检查结果      提示   参考范围      单位
白细胞        7.01                 3.5-9.5       10^9/L
红细胞压积    41.3                 35.0-45.0     %
血红蛋白      140                  115-150       g/L
红细胞        4.58                 3.80-5.10     10^12/L
血小板        222                  125-350       10^9/L
高密度脂蛋白  1.77          ↑      1.03-1.55     mmol/L
心电图(12导联)
检查结果
窦性心律 正常心电图`;
  const parsed = parseTextLabTable(layout, 6);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 7);
  assert.equal(parsed.items[5].status, 'abnormal');
  assert.equal(parsed.items[6].itemType, 'imaging');
  assert.equal(parsed.items[6].findings, '窦性心律 正常心电图');
  assert.equal(parsed.items[6].manualReviewStatus, 'pending');
});

test('text-layer parser does not accept free text without a structured table', () => {
  const parsed = parseTextLabTable('姓名 某某\n检查结果\n白细胞 7.01\n报告时间 2021-06-16', 6);
  assert.equal(parsed.supported, false);
  assert.equal(parsed.items.length, 0);
});
