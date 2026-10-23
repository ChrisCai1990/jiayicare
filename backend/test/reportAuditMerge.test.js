const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeCoverageAuditItems, normalizeExplicitNormalStatus } = require('../src/utils/reportAuditMerge');
const { alignSupplementCandidate, mergeSupplementItems, sameReportItem } = require('../src/utils/reportPageSupplement');

test('coverage audit restores the pathology result and missing eye rows', () => {
  const first = [
    { name: '宫颈刮片', sourceSection: '妇科病理培养', sourcePage: 2, itemType: 'imaging', findings: '-', diagnosis: '未见明显异常', status: 'normal' },
    { name: '巩膜', sourceSection: '眼科', sourcePage: 2, itemType: 'imaging', findings: '', diagnosis: '未见异常', status: 'unknown' },
  ];
  const audit = [
    { name: '宫颈刮片', sourceSection: '妇科病理培养', sourcePage: 2, itemType: 'lab', value: '未见上皮内病变及恶性细胞（NILM）', status: 'normal' },
    { name: '裸眼视力（右）', sourceSection: '眼科', sourcePage: 2, itemType: 'lab', value: '5.0', status: 'normal' },
    { name: '裸眼视力（左）', sourceSection: '眼科', sourcePage: 2, itemType: 'lab', value: '5.0', status: 'normal' },
  ];
  const merged = mergeCoverageAuditItems(first, audit);
  assert.equal(merged.length, 4);
  assert.equal(merged[0].findings, '未见上皮内病变及恶性细胞（NILM）');
  assert.equal(merged[1].status, 'normal');
  assert.deepEqual(merged.slice(2).map(item => item.name), ['裸眼视力（右）', '裸眼视力（左）']);
  assert.equal(first[0].findings, '-');
});

test('coverage audit extends a partially extracted numbered imaging result without duplicating the exam', () => {
  const first = [{ name: '近红外脑功能成像检查', sourcePage: 6, sourceSection: '视图区', itemType: 'imaging',
    findings: '1. 脑血流变化趋势正常。', diagnosis: '' }];
  const audit = [{ ...first[0], sourceSection: '检查结果', findings: '1. 脑血流变化趋势正常。\n2. 检测期间注意力集中。\n3. 报告另有原文说明。' }];
  const merged = mergeCoverageAuditItems(first, audit);
  assert.equal(merged.length, 1);
  assert.match(merged[0].findings, /3\. 报告另有原文说明/);
  assert.equal(first[0].findings, '1. 脑血流变化趋势正常。');
  const reviewed = mergeCoverageAuditItems([{ ...first[0], manualReviewStatus: 'reviewed' }], audit);
  assert.equal(reviewed[0].findings, first[0].findings);
  const unrelated = mergeCoverageAuditItems(first, [{ ...audit[0], sourcePage: 7 }]);
  assert.equal(unrelated[0].findings, first[0].findings);
  const competing = mergeCoverageAuditItems(first, [{ ...audit[0], findings: '1. 不同的观察。\n2. 另一段。' }]);
  assert.equal(competing[0].findings, first[0].findings);
});

test('explicit normal wording changes unknown only without conflicting evidence', () => {
  assert.equal(normalizeExplicitNormalStatus({ status: 'unknown', diagnosis: '未见异常' }).status, 'normal');
  assert.equal(normalizeExplicitNormalStatus({ status: 'unknown', findings: '巩膜黄染', diagnosis: '未见异常' }).status, 'unknown');
  assert.equal(normalizeExplicitNormalStatus({ status: 'unknown', diagnosis: '未见明显异常，但建议复查' }).status, 'unknown');
  assert.equal(normalizeExplicitNormalStatus({ status: 'abnormal', diagnosis: '未见异常' }).status, 'abnormal');
});

test('a simple numeric lab result inside its printed range becomes normal', () => {
  for (const [name, value, referenceRange] of [
    ['嗜酸性粒细胞数', '0.12', '0.0-0.60'],
    ['嗜碱性粒细胞数', '0.03', '0.00-0.59'],
    ['中性粒细胞百分比', '45.80', '40.00-75.00'],
    ['淋巴细胞百分比', '44.00', '20.00-50.00'],
  ]) {
    assert.equal(normalizeExplicitNormalStatus({ name, itemType: 'lab', value, referenceRange, status: 'unknown' }).status, 'normal');
  }
  const lab = { itemType: 'lab', value: '0.61', referenceRange: '0.0-0.60', status: 'unknown' };
  assert.equal(normalizeExplicitNormalStatus(lab).status, 'unknown');
  assert.equal(normalizeExplicitNormalStatus({ ...lab, value: '0.12', findings: '异常' }).status, 'unknown');
  assert.equal(normalizeExplicitNormalStatus({ ...lab, value: '0.12', reviewIssues: ['读数不清'] }).status, 'unknown');
  assert.equal(normalizeExplicitNormalStatus({ ...lab, value: '0.12', referenceRange: '<0.60' }).status, 'unknown');
  assert.equal(normalizeExplicitNormalStatus({ ...lab, value: '0.12', status: 'abnormal' }).status, 'abnormal');
});

test('single-page supplement replaces a dash without changing reviewed content', () => {
  const old = { name: '宫颈刮片', sourceSection: '妇科病理培养', itemType: 'imaging', findings: '-', diagnosis: '未见明显异常' };
  const candidate = { ...old, findings: '未见上皮内病变及恶性细胞（NILM）' };
  const enriched = mergeSupplementItems([old], [candidate]);
  assert.equal(enriched.enriched.length, 1);
  assert.equal(enriched.items[0].findings, candidate.findings);
  const reviewed = mergeSupplementItems([{ ...old, manualReviewStatus: 'reviewed' }], [candidate]);
  assert.equal(reviewed.items[0].findings, '-');
});

test('single-page supplement extends numbered findings only when the original text is retained', () => {
  const old = { name: '近红外脑功能成像检查', sourcePage: 6, sourceSection: '视图区', itemType: 'imaging', findings: '1. 脑血流变化趋势正常。' };
  const candidate = { ...old, sourceSection: '检查结果', findings: '1. 脑血流变化趋势正常。\n2. 检测期间注意力集中。\n3. 报告另有说明。' };
  const merged = mergeSupplementItems([old], [candidate]);
  assert.equal(merged.enriched.length, 1);
  assert.equal(merged.items[0].findings, candidate.findings);
  assert.equal(mergeSupplementItems([{ ...old, manualReviewStatus: 'reviewed' }], [candidate]).items[0].findings, old.findings);
  assert.equal(mergeSupplementItems([old], [{ ...candidate, findings: '1. 不同的观察。\n2. 另一段。' }]).items[0].findings, old.findings);
});

test('single-page supplement aligns a textual cervical pathology lab result with its existing review row', () => {
  const old = { name: '宫颈刮片', sourceSection: '妇科病理培养', sourcePage: 2,
    itemType: 'imaging', findings: '-', diagnosis: '未见明显异常' };
  const candidate = { name: '宫颈刮片', sourceSection: '妇科病理培养', sourcePage: 2,
    itemType: 'lab', value: '未见上皮内病变及恶性细胞（NILM）' };
  const aligned = alignSupplementCandidate([old], candidate);
  assert.equal(aligned.itemType, 'imaging');
  assert.equal(aligned.findings, candidate.value);
  assert.equal(sameReportItem(old, aligned), true);
  const merged = mergeSupplementItems([old], [aligned]);
  assert.equal(merged.added.length, 0);
  assert.equal(merged.enriched.length, 1);
  assert.equal(merged.items[0].findings, candidate.value);
  assert.equal(alignSupplementCandidate([{ ...old, manualReviewStatus: 'reviewed' }], candidate), null);
  assert.equal(alignSupplementCandidate([{ ...old, findings: '人工已录入' }], candidate), null);
});
