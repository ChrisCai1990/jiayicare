const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDepartmentExamItems, normalizeBreathTestItems, normalizeSingleExamReportItems, normalizeUltrasoundExamNames, realignUpperAbdomenConclusions, upperAbdomenCoverage } = require('../src/utils/reportItemNormalization');

test('器官标题在超声证据下补齐检查方式后再归类', () => {
  const output = normalizeUltrasoundExamNames([
    { name: '双侧甲状腺', itemType: 'imaging', findings: '实质回声不均，CDFI未见异常血流' },
    { name: '肝脏', itemType: 'imaging', findings: '实质回声增多' },
    { name: '胆囊', itemType: 'imaging', findings: '胆囊内透声佳' },
    { name: '胰腺', itemType: 'imaging', findings: '胰腺实质回声均匀' },
    { name: '腹部', itemType: 'imaging', findings: '腹壁脂肪增厚' },
  ]);
  assert.deepEqual(output.map(item => item.name), ['甲状腺超声', '肝脏超声', '胆囊超声', '胰腺超声', '腹部']);
  assert.equal(output[0].originalName, '双侧甲状腺');
});

test('碳13标题纠正OCR丢失13和幽门螺杆菌错字', () => {
  const out = normalizeBreathTestItems([{
    name: '碳尿素测定门螺杆菌结果', itemType: 'lab', value: '0.6', referenceRange: '<4.0', diagnosis: '阴性', _page: 1,
  }], { title: '碳13呼气试验' });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '碳13呼气试验');
  assert.equal(out[0].itemType, 'imaging');
  assert.equal(out[0].findings, '测定值：0.6\n正常值：<4.0');
  assert.equal(out[0].diagnosis, '阴性');
});

test('单项碳13报告删除医生和结论版面标签，只保留一个检查项目', () => {
  const output = normalizeSingleExamReportItems([
    { name: '报告医生', value: '骆菊丽', itemType: 'lab' },
    { name: '开单医生', value: '郑霞', itemType: 'lab' },
    { name: '碳尿素测幽门', value: '0.6', referenceRange: '<4.0', diagnosis: '阴性', itemType: 'lab' },
    { name: '诊断结论', findings: '阴性', itemType: 'imaging' },
  ], { title: '碳13呼气试验' });
  assert.equal(output.length, 1);
  assert.equal(output[0].name, '碳13呼气试验');
  assert.equal(output[0].itemType, 'imaging');
});

test('单项报告过滤检查者和签发人员等版面元数据', () => {
  const output = normalizeSingleExamReportItems([
    { name: '检查者', value: '李林', itemType: 'lab' },
    { name: '签发医生', value: '张医生', itemType: 'lab' },
    { name: '是否吸烟', value: '不吸', itemType: 'data' },
  ], { title: '全科检查' });
  assert.deepEqual(output.map(item => item.name), ['是否吸烟']);
});

test('全科单项报告逐项保留，便于按原报告逐行核对', () => {
  const output = normalizeSingleExamReportItems([
    { name: '是否吸烟', value: '不吸', itemType: 'lab' },
    { name: '是否饮酒', value: '饮酒', itemType: 'data' },
    { name: '甲状腺', value: '甲状腺结节', itemType: 'lab', status: 'abnormal' },
  ], { title: '全科（内外科）' });
  assert.equal(output.length, 3);
  assert.deepEqual(output.map(item => item.name), ['是否吸烟', '是否饮酒', '甲状腺']);
  assert.ok(output.every(item => item.itemType === 'imaging'));
  assert.equal(output[0].findings, '不吸');
  assert.equal(output[2].findings, '甲状腺结节');
});

test('耳鼻喉科保留每个器官细行，不合并成科室摘要', () => {
  const items = ['耳部检查', '鼻部检查', '咽部检查'].map((name, index) => ({
    name, findings: '未见明显异常', sourceSection: '耳鼻喉科体检', itemType: 'imaging', _page: 1, _order: index,
  }));
  const output = normalizeDepartmentExamItems(items);
  assert.equal(output.length, 3);
  assert.deepEqual(output.map(item => item.name), ['耳部检查', '鼻部检查', '咽部检查']);
  assert.ok(output.every(item => item.itemType === 'imaging'));
});

test('单条科室检查保留报告原名', () => {
  const output = normalizeDepartmentExamItems([
    { name: '口腔科', findings: '未见明显异常', sourceSection: '口腔科体检', itemType: 'imaging' },
  ]);
  assert.equal(output[0].name, '口腔科');
});

test('眼科前房清和双侧周边前房深度逐项保留且不漏字段', () => {
  const output = normalizeDepartmentExamItems([
    { name: '前房清', value: '是', sourceSection: '眼科体检', itemType: 'data' },
    { name: '周边前房深度右', value: '≥1', sourceSection: '眼科体检', itemType: 'data' },
    { name: '周边前房深度左', value: '≥1', sourceSection: '眼科体检', itemType: 'data' },
  ]);
  assert.deepEqual(output.map(item => item.name), ['前房清', '周边前房深度右', '周边前房深度左']);
  assert.deepEqual(output.map(item => item.findings), ['是', '≥1', '≥1']);
  assert.ok(output.every(item => item.itemType === 'imaging'));
});

test('把明确写着胆囊的超声结论从肝脏项搬回胆囊项', () => {
  const output = realignUpperAbdomenConclusions([
    { name: '肝脏彩超', itemType: 'imaging', diagnosis: '胆囊壁毛糙', conclusion: '胆囊壁毛糙', _page: 1 },
    { name: '胆囊彩超', itemType: 'imaging', diagnosis: '', conclusion: '', _page: 1 },
    { name: '脾脏彩超', itemType: 'imaging', diagnosis: '', conclusion: '', _page: 1 },
  ]);
  assert.equal(output[0].diagnosis, '');
  assert.equal(output[1].diagnosis, '胆囊壁毛糙');
  assert.equal(output[1].conclusion, '胆囊壁毛糙');
});

test('同页肝胆脾只有三项时能识别为腹部超声覆盖不完整', () => {
  assert.equal(upperAbdomenCoverage(['肝脏', '胆囊', '脾脏'].map(name => ({ name: `${name}彩超` }))), 3);
});

