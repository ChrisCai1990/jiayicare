const test = require('node:test');
const assert = require('node:assert/strict');
const { assessReportItems, statusFromRange, isClearlyNonDetailTextPage, isBoilerplateOnlyReportTextPage, formatTextLayerEvidence, formatAdjacentTextLayerContext, selectGenericCoverageAuditPages, recoverExplicitUltrasoundRowsFromTextLayer } = require('../src/utils/reportOcrQuality');

test('covered group summaries are removed while detailed page items remain', () => {
  const items = assessReportItems([
    { name: '血压', value: '122/66', itemType: 'data', sourcePage: 8 },
    { name: '收缩压', value: '122', itemType: 'data', sourcePage: 8 },
    { name: '舒张压', value: '66', itemType: 'data', sourcePage: 8 },
    { name: '血常规', value: '5.00', itemType: 'lab', sourcePage: 9 },
    { name: '白细胞计数', value: '5.00', itemType: 'lab', sourcePage: 9 },
  ]);
  assert.deepEqual(items.map(item => item.name), ['收缩压', '舒张压', '白细胞计数']);
});

test('adjacent page context includes only the previous tail and excludes future-page leakage', () => {
  const context = formatAdjacentTextLayerContext([
    `内科\n${'A'.repeat(1200)}`,
    '当前页结果',
    `${'B'.repeat(1200)}\n外科`,
  ], 2, 100);
  assert.match(context, /previous_page_tail/);
  assert.doesNotMatch(context, /next_page_head/);
  assert.doesNotMatch(context, /B{20}/);
  assert.match(context, /不得提取上一页自己的项目/);
  assert.ok(context.length < 600);
});

test('explicitly normal examination prose does not enter the review queue', () => {
  const [item] = assessReportItems([{
    name: '皮肤', itemType: 'imaging', findings: '未见明显异常', status: 'unknown', sourcePage: 9,
  }]);
  assert.equal(item.status, 'normal');
  assert.equal(item.reviewPriority, 'auto');
});

test('numeric abnormal without range evidence is review, not high priority', () => {
  const [item] = assessReportItems([{
    name: '体重', itemType: 'data', value: '92.2', status: 'abnormal', sourcePage: 8,
  }]);
  assert.equal(item.status, 'unknown');
  assert.equal(item.reviewPriority, 'review');
  assert.ok(item.qualityFlags.includes('abnormal_unverified'));
});

test('abnormal imaging without diagnosis is explicitly flagged', () => {
  const [item] = assessReportItems([{
    name: '腹部彩超', itemType: 'imaging', findings: '肝内可见异常回声', diagnosis: '', status: 'attention', sourcePage: 13,
  }]);
  assert.equal(item.reviewPriority, 'high');
  assert.ok(item.qualityFlags.includes('diagnosis_missing'));
});

test('generic department other item is renamed without losing evidence', () => {
  const [item] = assessReportItems([{
    name: '内科', sourceSection: '内科', itemType: 'imaging', findings: '无', status: 'normal', sourcePage: 8,
  }]);
  assert.equal(item.name, '内科其他');
  assert.equal(item.findings, '无');
});

test('native text layer restores omitted internal medicine history and opinion', () => {
  const items = assessReportItems([{
    name: '内科', sourceSection: '内科', itemType: 'imaging', findings: '无', status: 'normal', sourcePage: 8,
  }], { textLayer: { available: true, pages: Array(7).fill('').concat(['内科\n病史  无\n家族史  无特殊\n内科其它  无\n初步意见  未⻅明显异常\n外科']) } });
  assert.ok(items.some(item => item.name === '病史' && item.findings === '无'));
  assert.ok(items.some(item => item.name === '家族史' && item.findings === '无特殊'));
  const other = items.find(item => item.name === '内科其他');
  assert.equal(other.diagnosis, '未见明显异常');
});

test('blood pressure is evaluated against systolic and diastolic ranges', () => {
  assert.equal(statusFromRange({ name: '血压', value: '122/66', referenceRange: '90.0-139.0 / 60.0-89.0', itemType: 'data' }), 'normal');
});

test('one-sided reference ranges override incorrect model abnormal labels', () => {
  const cases = [
    ['6.9', '<15.0'], ['2.8', '<8.0'], ['4.41', '<6.84'], ['0.21', '<1.50'],
    ['>20.22', '>3.0'], ['>180.0', '>70.0'],
  ];
  cases.forEach(([value, referenceRange]) => {
    assert.equal(statusFromRange({ name: '检验项', value, referenceRange, itemType: 'lab' }), 'normal');
  });
  const [item] = assessReportItems([{
    name: '鳞状上皮细胞癌相关抗原', value: '0.21', referenceRange: '<1.50', status: 'abnormal', itemType: 'lab', screeningKey: 'scc',
  }]);
  assert.equal(item.status, 'normal');
  assert.ok(item.qualityFlags.includes('status_conflict'));
});

test('numeric result conflicting with model status is marked for review', () => {
  const [item] = assessReportItems([{ name: '体重指数', value: '29.3', referenceRange: '18.5—23.99', status: 'normal', itemType: 'data', screeningKey: 'bmi' }]);
  assert.equal(item.status, 'abnormal');
  assert.ok(item.qualityFlags.includes('status_conflict'));
  assert.equal(item.reviewPriority, 'high');
});

test('identical cross-page entries are retained but labelled as duplicates', () => {
  const items = assessReportItems([
    { name: '内科', itemType: 'imaging', findings: '未见明显异常', diagnosis: '未见明显异常', status: 'unknown' },
    { name: '内科', itemType: 'imaging', findings: '未见明显异常', diagnosis: '未见明显异常', status: 'unknown', sourcePage: 9 },
  ]);
  assert.ok(items.every(item => item.qualityFlags.includes('cross_page_duplicate')));
  assert.ok(items.every(item => item.duplicateGroup));
});

test('text layer only skips unmistakably non-clinical pages', () => {
  assert.equal(isClearlyNonDetailTextPage('目录\n第一章 体检项目'), true);
  assert.equal(isClearlyNonDetailTextPage('检查结果\n白细胞 5.00 参考范围 3.50-9.50'), false);
});

test('header and footer only text is sent to visual page classification', () => {
  const boilerplate = `健康体检报告 MEDICAL EXAMINATION REPORT  夏小波 先生 用户ID 5069437410 体检号 3072608140052\n${'A'.repeat(64)}\n爱康卓悦杭州未来科技城分院 15 / 27\n注：自费增项\n全国统一报告解读专线：400-081-8899\n司）`;
  assert.equal(isBoilerplateOnlyReportTextPage(boilerplate), true);
  assert.equal(isBoilerplateOnlyReportTextPage(`${boilerplate}\n超声所见 肝脏形态正常`), false);
});

test('page text is delimited as evidence and bounded before visual extraction', () => {
  const prompt = formatTextLayerEvidence('超声所见\n肝脏形态正常\n初步意见 未见明显异常', 8);
  assert.match(prompt, /同页 PDF 文字层证据/);
  assert.match(prompt, /<page_text>/);
  assert.ok(prompt.includes('超声所见'));
  assert.ok(!prompt.includes('初步意见'));
  assert.equal(formatTextLayerEvidence('  '), '');
});

test('generic coverage audit only retries sparse pages', () => {
  const pages = selectGenericCoverageAuditPages([8, 9, 10, 11], [
    { sourcePage: 8, name: '体重', value: '60' },
    { sourcePage: 9, name: '甲状腺超声', itemType: 'imaging', findings: '未见明显异常' },
    { sourcePage: 9, name: '颈动脉超声', itemType: 'imaging', findings: '未见明显异常' },
    { sourcePage: 9, name: '心脏超声', itemType: 'imaging', findings: '未见明显异常' },
    { sourcePage: 10, name: '白细胞', value: '5.0' },
    { sourcePage: 10, name: '红细胞', value: '4.5' },
    { sourcePage: 10, name: '血小板', value: '200' },
    { sourcePage: 11, name: '眼压', itemType: 'imaging', findings: '' },
    { sourcePage: 11, name: '视力', itemType: 'imaging', findings: '正常' },
    { sourcePage: 11, name: '眼底', itemType: 'imaging', findings: '正常' },
  ]);
  assert.deepEqual(pages, [8]);
});

test('native text layer restores explicit ultrasound organ rows without duplicating existing organs', () => {
  const textLayer = {
    available: true,
    pages: [`超声检查\n  胆                                   未见明显异常\n  胰                                   未见明显异常\n  脾                                   未见明显异常\n  双肾                                  双肾大小正常`],
  };
  const restored = recoverExplicitUltrasoundRowsFromTextLayer([
    { name: '双肾输尿管膀胱彩超', itemType: 'imaging', findings: '双肾大小正常', sourcePage: 1 },
  ], textLayer);
  assert.deepEqual(restored.map(item => item.name), [
    '双肾输尿管膀胱彩超',
    '胆囊彩超',
    '胰腺彩超',
    '脾脏彩超',
  ]);
  assert.equal(restored.filter(item => item.name.includes('双肾')).length, 1);
});

test('key numeric fields need visual and text-layer evidence before auto pass', () => {
  const [verified] = assessReportItems([{ name: '白细胞计数', value: '5.00', unit: '10^9/L', referenceRange: '3.50-9.50', status: 'normal', itemType: 'lab', sourcePage: 1, screeningKey: 'wbc' }], { textLayer: { available: true, pages: ['血常规 白细胞计数 5.00 3.50-9.50'] } });
  assert.equal(verified.textLayerEvidence, 'verified');
  assert.equal(verified.reviewPriority, 'auto');

  const [unverified] = assessReportItems([{ name: '白细胞计数', value: '5.00', referenceRange: '3.50-9.50', status: 'normal', itemType: 'lab', sourcePage: 1, screeningKey: 'wbc' }], { textLayer: { available: true, pages: ['血常规 白细胞计数 6.00 3.50-9.50'] } });
  assert.ok(unverified.qualityFlags.includes('text_layer_unverified'));
  assert.equal(unverified.reviewPriority, 'review');
});
