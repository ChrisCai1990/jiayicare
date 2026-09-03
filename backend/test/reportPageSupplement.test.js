const test = require('node:test');
const assert = require('node:assert/strict');
const { describeExistingReportItems, filterMissingReportItems, hasReportItemEvidence, inferMissingUltrasoundOrgans, mergeSupplementItems } = require('../src/utils/reportPageSupplement');

test('单页补提会向模型列出已有项目及所属栏目', () => {
  assert.equal(describeExistingReportItems([
    { name: '白细胞计数', orderName: '血常规' },
    { name: '胆囊超声', sourceSection: '腹部超声' },
  ]), '白细胞计数（血常规）、胆囊超声（腹部超声）');
});

test('单页补提硬过滤已有项目，即使AI返回了不同数值', () => {
  const existing = [{ name: '白细胞计数', itemType: 'lab', value: '5.1', unit: '10^9/L', orderName: '血常规' }];
  const candidates = [
    { name: '白细胞计数', itemType: 'lab', value: '5.7', unit: '10^9/L', orderName: '血常规' },
    { name: '血小板计数', itemType: 'lab', value: '210', unit: '10^9/L', orderName: '血常规' },
  ];
  assert.deepEqual(filterMissingReportItems(existing, candidates).map(item => item.name), ['血小板计数']);
});

test('不同栏目下的同名项目仍可作为真实缺项补提', () => {
  const existing = [{ name: '结论', itemType: 'imaging', sourceSection: '心电图' }];
  const candidates = [{ name: '结论', itemType: 'imaging', sourceSection: '胸部CT' }];
  assert.equal(filterMissingReportItems(existing, candidates).length, 1);
});

test('从组合超声已有所见中计算只缺脾脏、胰腺和膀胱', () => {
  const existing = [
    { name: '肝胆脾胰', itemType: 'imaging', bodyPart: '肝脏, 胆囊, 脾脏, 胰腺', findings: '肝脏形态正常。胆囊大小形态正常。' },
    { name: '输尿管+膀胱彩超', itemType: 'imaging', bodyPart: '输尿管, 膀胱', findings: '双侧输尿管未见明显扩张。' },
  ];
  assert.deepEqual(inferMissingUltrasoundOrgans(existing).map(item => item.label), ['脾脏', '胰腺', '膀胱']);
});

test('有明确超声缺项时只接受带器官原词证据的目标项', () => {
  const existing = [{ name: '肝胆脾胰', itemType: 'imaging', bodyPart: '肝脏, 胆囊, 脾脏, 胰腺', findings: '肝脏形态正常。胆囊大小形态正常。' }];
  const targets = inferMissingUltrasoundOrgans(existing);
  const candidates = [
    { name: '肝脏彩超', itemType: 'imaging', findings: '肝脏实质回声增粗。' },
    { name: '脾脏彩超', itemType: 'imaging', findings: '边缘整齐，胰管未见扩张。' },
    { name: '胰腺彩超', itemType: 'imaging', findings: '胰腺大小形态正常，胰管未见扩张。' },
    { name: '腹主动脉彩超', itemType: 'imaging', findings: '未见明显异常回声。' },
  ];
  assert.deepEqual(filterMissingReportItems(existing, candidates, { targetOrgans: targets }).map(item => item.name), ['胰腺彩超']);
});

test('数值项目没有数值不能作为有效OCR结果', () => {
  assert.equal(hasReportItemEvidence({ name: '身高', itemType: 'data' }), false);
  assert.equal(hasReportItemEvidence({ name: '身高', itemType: 'data', value: '158.50' }), true);
  assert.equal(hasReportItemEvidence({ name: '内科', itemType: 'imaging', findings: '未见异常' }), true);
});

test('补提可补全未审核空壳项，但绝不覆盖人工已核对项目', () => {
  const blank = { itemId: 'blank', name: '身高', itemType: 'data', value: '', manualReviewStatus: 'pending' };
  const improved = { name: '身高', itemType: 'data', value: '158.50', unit: 'cm' };
  const first = mergeSupplementItems([blank], [improved]);
  assert.equal(first.items[0].value, '158.50');
  assert.equal(first.items[0].itemId, 'blank');
  assert.equal(first.enriched.length, 1);

  const reviewed = { ...blank, value: '160', manualReviewStatus: 'reviewed' };
  const second = mergeSupplementItems([reviewed], [improved]);
  assert.equal(second.items[0].value, '160');
  assert.equal(second.enriched.length, 0);
});
