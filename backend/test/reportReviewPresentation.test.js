const test = require('node:test');
const assert = require('node:assert/strict');

test('review displays every Admin path and marks retired or missing categories', async () => {
  const { reportClassificationLabels } = await import('../../staff/src/utils/reportReviewQuality.js');
  const catalog = [{ label: '检查', opts: [{ value: '1|超声|心脏彩超', path: ['检查', '影像', '超声', '心脏彩超'], label: '超声 / 心脏彩超' }] }];
  assert.deepEqual(reportClassificationLabels({ screeningKey: '1|超声|心脏彩超', screeningKeys: ['1|超声|心脏彩超', '2|检验|旧项目'] }, catalog), ['检查 → 影像 → 超声 → 心脏彩超', '原归类：检验 → 旧项目（当前目录未找到，待 Admin 核对）']);
  assert.deepEqual(reportClassificationLabels({ matchStatus: 'matched' }, catalog), []);
});

test('correcting a prose name keeps all source evidence and resets human review', async () => {
  const { reportNameCorrection, reportItemNameConcern } = await import('../../staff/src/utils/reportReviewQuality.js');
  const prose = 'M型、2-DE：主动脉内径正常，主动脉瓣清晰，启闭无殊；肺动脉内径正常，肺动脉瓣启闭无殊。';
  const item = { itemType: 'imaging', name: prose.slice(1), orderName: prose, sourceSection: '心脏彩超', findings: '二尖瓣口见少量反流信号', manualReviewStatus: 'reviewed' };
  const snapshot = JSON.stringify(item);
  assert.ok(reportItemNameConcern(item));
  const corrected = reportNameCorrection(item);
  assert.equal(corrected.name, '心脏彩超');
  assert.equal(corrected.findings, prose + '\n二尖瓣口见少量反流信号');
  assert.equal(corrected.manualReviewStatus, 'pending');
  assert.equal(JSON.stringify(item), snapshot);
  assert.equal(reportNameCorrection({ ...item, sourceSection: '' }), null);
  assert.equal(reportNameCorrection({ ...item, name: '心脏彩超' }), null);
});

test('identical conclusions use one editor, distinct conclusions stay separate', async () => {
  const { sameReportConclusion } = await import('../../staff/src/utils/reportReviewQuality.js');
  assert.equal(sameReportConclusion({ diagnosis: '轻度反流', conclusion: '轻度反流 ' }), true);
  assert.equal(sameReportConclusion({ diagnosis: '', conclusion: '轻度反流' }), true);
  assert.equal(sameReportConclusion({ diagnosis: '轻度反流', conclusion: '左室舒张功能减退' }), false);
});
