const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextNarrativeFindings } = require('../src/utils/reportTextNarrativeFindings');
const { mergeSupplementItems } = require('../src/utils/reportPageSupplement');

const layout = `超声检查报告
检查所见：
肝脏形态正常，实质回声均匀，门静脉未见扩张。
胆囊大小形态正常，囊壁光滑，腔内未见异常回声。
胰腺形态正常，主胰管未见扩张。
脾脏大小正常，实质回声均匀。
双肾形态正常，集合系统未见分离。
双侧输尿管未见明显扩张。
膀胱充盈良好，壁光滑。
前列腺形态正常，内部回声均匀。
甲状腺形态正常，未见异常结节。
双侧颈动脉血管走行正常，内膜光滑，血流通畅。
诊断意见：
未见明显异常。`;
const existing = { itemId: 'kept', name: '腹部及颈部超声', itemType: 'imaging', sourcePage: 17,
  sourceSection: '超声检查', findings: layout.split('\n').slice(2, 6).join('\n'),
  manualReviewStatus: 'pending' };

test('organ specific draft keeps unrelated ultrasound paragraphs as separate pending items', () => {
  const draft = { ...existing, name: '肝胆脾胰', findings: layout.split('\n').slice(4, 6).join('\n') };
  const kidney = { ...existing, itemId: 'kidney', name: '双肾超声',
    findings: '双肾形态正常，集合系统', manualReviewStatus: 'pending' };
  const candidate = parseTextNarrativeFindings(layout, [draft, kidney], 17);
  assert.equal(candidate.supported, true);
  assert.deepEqual(candidate.items.map(item => item.name),
    ['双肾超声', '双侧输尿管', '膀胱', '前列腺', '甲状腺', '双侧颈动脉']);
  assert.ok(candidate.items.every(item => item.manualReviewStatus === 'pending'));
  assert.ok(candidate.items.every(item => !item.diagnosis));
  const merged = mergeSupplementItems([draft, kidney], candidate.items);
  assert.equal(merged.items[0].itemId, 'kept');
  assert.equal(merged.items[0].findings, draft.findings);
  assert.equal(merged.items[1].itemId, 'kidney');
});

test('ambiguous or reviewed findings stay untouched', () => {
  assert.equal(parseTextNarrativeFindings(layout, [existing], 17).supported, false);
  const reviewed = { ...existing, name: '双肾超声', manualReviewStatus: 'reviewed' };
  assert.ok(!parseTextNarrativeFindings(layout, [reviewed], 17).items.some(item => item.name === '双肾'));
  assert.equal(parseTextNarrativeFindings(layout, [existing, { ...existing, itemId: 'other' }], 17).supported, false);
  assert.equal(parseTextNarrativeFindings(layout.replace('双肾形态正常', '两肾形态正常'),
    [{ ...existing, findings: '另一段不匹配的检查所见，不能据此覆盖原有项目。' }], 17).supported, false);
  assert.equal(parseTextNarrativeFindings(layout.replace('诊断意见：', '检查所见：'), [existing], 17).supported, false);
});
