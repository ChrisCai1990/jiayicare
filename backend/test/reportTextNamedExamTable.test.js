const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextNamedExamTable, parseCrossPageNamedExamTable,
  filterUncoveredNamedExams } = require('../src/utils/reportTextNamedExamTable');

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

test('PDF word coordinates preserve wrapped findings and separate diagnosis', () => {
  const word = (text, x, y) => ({ text, x, y });
  const boxes = [
    word('【体检心脏】', 30, 202),
    word('项目名称', 66, 226), word('影像表现', 240, 226), word('诊断结论', 447, 226),
    word('影像结果', 70, 245), word('1.各房室内径正常，大血管连接正常。', 153, 245), word('心脏目前未见明显异常', 377, 245),
    word('2.房室间隔回声连续。', 153, 262), word('3.各瓣膜形态活动正常。', 153, 279),
    word('4.室壁运动协调。', 153, 296), word('5.舒张期心包腔未见积液。', 153, 313),
    word('【体检肝胆脾胰肾】', 30, 447),
    word('项目名称', 66, 471), word('影像表现', 240, 471), word('诊断结论', 447, 471),
    word('影像结果', 70, 490), word('肝脏大小形态正常。', 165, 490), word('肝胆脾胰双肾未见明显异常', 377, 490),
    word('胆囊大小正常。', 153, 507), word('双肾形态正常。', 153, 524),
    word('体检号:123姓名:测试', 153, 800), word('性别：女第17/30页', 377, 800),
  ];
  const result = parseTextNamedExamTable('', 17, boxes);
  assert.equal(result.supported, true);
  assert.equal(result.items.length, 2);
  assert.match(result.items[0].findings, /5.舒张期心包腔未见积液/);
  assert.equal(result.items[0].diagnosis, '心脏目前未见明显异常');
  assert.match(result.items[1].findings, /双肾形态正常/);
  assert.equal(result.items[1].diagnosis, '肝胆脾胰双肾未见明显异常');
  assert.doesNotMatch(result.items[1].findings + result.items[1].diagnosis, /体检号|姓名|性别|17\/30/);
  const pending = filterUncoveredNamedExams([{ name: '心脏超声', itemType: 'imaging',
    sourceSection: '体检心脏', sourcePage: 17, findings: '已有人工核对的完整所见', manualReviewStatus: 'reviewed' }], result.items);
  assert.deepEqual(pending.map(item => item.name), ['体检肝胆脾胰肾']);
});

test('a named header on the previous page joins only the leading next-page result', () => {
  const previous = '【体检甲状腺】\n项目名称      影像表现      诊断结论\n影像结果      甲状腺大小正常\n【体检颈动脉】\n项目名称      影像表现      诊断结论';
  const boxes = [
    { text: '影像结果', x: 70, y: 47 },
    { text: '双侧颈总动脉管径对称。', x: 153, y: 47 },
    { text: '双侧颈动脉未见异常', x: 377, y: 47 },
    { text: '双侧颈内动脉血流正常。', x: 153, y: 64 },
    { text: '【体检心脏】', x: 30, y: 202 },
  ];
  const result = parseCrossPageNamedExamTable(previous, boxes, 17);
  assert.equal(result.supported, true);
  assert.deepEqual(result.items.map(item => item.name), ['体检颈动脉']);
  assert.match(result.items[0].findings, /双侧颈内动脉/);
  assert.equal(result.items[0].diagnosis, '双侧颈动脉未见异常');
  assert.equal(parseCrossPageNamedExamTable(previous + '\n影像结果      已在前页出结果', boxes, 17).supported, false);
});
