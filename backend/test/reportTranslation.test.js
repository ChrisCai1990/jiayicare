const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceForTranslation, sourceHash, validateTranslation } = require('../src/utils/reportTranslation');
const { disclosure } = require('../src/utils/aiDataConsent');

test('report translation source excludes numeric results, units and reference ranges', () => {
  const report = { title: '肾功能', reportItems: [{ name: '肌酐', value: '88', unit: 'μmol/L', referenceRange: '57–111', findings: '', diagnosis: '' }] };
  const source = sourceForTranslation(report);
  assert.equal(JSON.stringify(source).includes('88'), false);
  assert.equal(JSON.stringify(source).includes('μmol/L'), false);
  assert.equal(JSON.stringify(source).includes('57–111'), false);
  assert.equal(source.items[0].name, '肌酐');
});

test('translation rejects omitted items and invalidates when original text changes', () => {
  const source = sourceForTranslation({ title: '阴道超声', reportItems: [{ name: '子宫', findings: '未见明显异常' }] });
  assert.equal(validateTranslation({ title: 'Ultrasound', items: [] }, source), null);
  assert.equal(validateTranslation({ title: 'Ultrasound', items: [{ name: 'Uterus', bodyPart: '', findings: 'No obvious abnormality', diagnosis: '' }] }, source).items.length, 1);
  assert.notEqual(sourceHash(source), sourceHash({ ...source, items: [{ ...source.items[0], findings: '见异常' }] }));
});

test('translation has a separate, report-specific consent purpose', () => {
  const consent = disclosure('report_translation');
  assert.equal(consent.provider, 'qwen');
  assert.match(consent.data, /不发送报告图片/);
  assert.match(consent.use, /英文/);
});
