const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextNamedExamTable } = require('../src/utils/reportTextNamedExamTable');

test('separate named heart and abdominal exam tables survive one page', () => {
  const layout = `影像结果            双侧颈动脉管径对称          双侧颈动脉未见异常
【体检心脏】
项目名称            影像表现                          诊断结论
影像结果            1.各房室内径正常                   心脏目前未见明显异常
                    2.室壁运动协调
                    3.舒张期心包腔未见明显无回声区
【体检肝胆脾胰肾】
项目名称            影像表现                          诊断结论
影像结果            肝脏大小形态正常                   肝胆脾胰双肾未见明显异常
                    肝实质回声均匀
                    胆囊未见明显异常`;
  const result = parseTextNamedExamTable(layout, 17);
  assert.equal(result.supported, true);
  assert.deepEqual(result.items.map(item => item.name), ['体检心脏', '体检肝胆脾胰肾']);
  assert.match(result.items[0].findings, /舒张期心包腔/);
  assert.equal(result.items[0].diagnosis, '心脏目前未见明显异常');
  assert.match(result.items[1].findings, /胆囊未见明显异常/);
  assert.equal(result.items[1].sourcePage, 17);
  assert.equal(result.items[0].manualReviewStatus, 'pending');
});

test('a heading without the three-column table cannot create a clinical item', () => {
  const result = parseTextNamedExamTable('【体检心脏】\n影像结果 心脏未见异常', 17);
  assert.equal(result.supported, false);
  assert.deepEqual(result.items, []);
});
