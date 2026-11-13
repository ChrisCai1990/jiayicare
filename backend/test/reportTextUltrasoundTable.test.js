const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextUltrasoundTable } = require('../src/utils/reportTextUltrasoundTable');

test('a result row and its next-page preliminary opinion form one pending candidate', () => {
  const page16 = `* 温馨提⽰：配合⽂字表述
检查项⽬                   检查所⻅                                                  单位
前列腺                    前列腺形态⼤⼩正常，包膜光滑，内⻅斑点状强回声
爱康国宾某门诊部                                                            16 / 29`;
  const page17 = `健康体检报告 MEDICAL EXAMINATION REPORT
。
初步意⻅      前列腺钙化灶
检查项⽬                    检查所⻅                                                  单位
甲状腺                     常。`;
  const parsed = parseTextUltrasoundTable(page16, 16, page17);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].name, '前列腺');
  assert.match(parsed.items[0].findings, /见斑点状强回声。$/);
  assert.equal(parsed.items[0].diagnosis, '前列腺钙化灶');
  assert.equal(parsed.items[0].sourcePage, 16);
  assert.equal(parsed.items[0].manualReviewStatus, 'pending');
});

test('a wrapped thyroid row keeps printed text before and after the item name', () => {
  const page17 = `初步意⻅      前列腺钙化灶
检查项⽬                    检查所⻅                                                  单位
甲状腺双侧叶⼤⼩、形态正常，包膜光滑、清晰完整，峡部厚度正
甲状腺                     常。甲状腺左侧叶可⻅⼀个结节状低回声，位于中下极，⼤⼩约4*2
mm，边界清晰，形态规则，CDFI：未⻅明显⾎流信号。余腺体实
质回声呈中等细密回声，分布均匀，CDFI：⾎流信号正常。
初步意⻅      左侧甲状腺结节（TI-RADS分级 3类）
爱康国宾某门诊部                                                            17 / 29`;
  const parsed = parseTextUltrasoundTable(page17, 17);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.items.length, 1);
  assert.match(parsed.items[0].findings, /^甲状腺双侧叶大小.*厚度正常。/);
  assert.match(parsed.items[0].findings, /余腺体实质回声/);
  assert.equal(parsed.items[0].diagnosis, '左侧甲状腺结节（TI-RADS分级 3类）');
  assert.equal(parsed.items[0].sourcePage, 17);
});

test('ambiguous text never enters the local candidate path', () => {
  assert.equal(parseTextUltrasoundTable('甲状腺 结节', 17).supported, false);
  assert.equal(parseTextUltrasoundTable('检查项目 检查所见 单位\n甲状腺 结节', 17).supported, false);
  assert.throws(() => parseTextUltrasoundTable('', 0), /页码/);
});
