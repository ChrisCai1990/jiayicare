const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDepartmentExamItems, normalizeBreathTestItems, realignUpperAbdomenConclusions, upperAbdomenCoverage } = require('../src/utils/reportItemNormalization');

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

test('耳鼻喉科按检查项目汇总，不把器官细行当成独立检查', () => {
  const items = ['耳部检查', '鼻部检查', '咽部检查'].map((name, index) => ({
    name, findings: '未见明显异常', sourceSection: '耳鼻喉科体检', itemType: 'imaging', _page: 1, _order: index,
  }));
  const output = normalizeDepartmentExamItems(items);
  assert.equal(output.length, 1);
  assert.equal(output[0].name, '耳鼻喉科检查');
  assert.match(output[0].findings, /耳部检查：未见明显异常/);
  assert.match(output[0].findings, /鼻部检查：未见明显异常/);
});

test('单条科室检查名称也归一为可归类的正式检查项目名', () => {
  const output = normalizeDepartmentExamItems([
    { name: '口腔科', findings: '未见明显异常', sourceSection: '口腔科体检', itemType: 'imaging' },
  ]);
  assert.equal(output[0].name, '口腔科检查');
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

