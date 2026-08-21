const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUltrasoundSubmission } = require('../src/utils/reportUltrasoundSubmission');

const us = (name, sourceSection = '肝胆胰脾彩超') => ({ name, sourceSection, itemType: 'imaging' });

test('combined upper-abdomen ultrasound requires four separate organ rows', () => {
  const incomplete = validateUltrasoundSubmission([us('肝脏彩超'), us('胆囊彩超'), us('脾脏彩超')]);
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.issues[0].missingOrgans, ['胰腺']);
  assert.equal(validateUltrasoundSubmission([us('肝脏彩超'), us('胆囊彩超'), us('胰腺彩超'), us('脾脏彩超')]).complete, true);
});

test('thyroid or breast combination titles require their explicit lymph-node row', () => {
  assert.equal(validateUltrasoundSubmission([us('甲状腺超声', '甲状腺及颈部淋巴结超声')]).complete, false);
  assert.equal(validateUltrasoundSubmission([
    us('甲状腺超声', '甲状腺及颈部淋巴结超声'),
    us('颈部淋巴结超声', '甲状腺及颈部淋巴结超声'),
  ]).complete, true);
  assert.deepEqual(validateUltrasoundSubmission([us('乳腺超声', '乳腺及腋窝淋巴结超声')]).issues[0].missingOrgans, ['淋巴结']);
});

test('urinary and gynecologic ultrasound groups are not over-split', () => {
  assert.equal(validateUltrasoundSubmission([us('双肾输尿管膀胱超声', '泌尿系超声')]).complete, true);
  assert.equal(validateUltrasoundSubmission([us('子宫附件阴道超声', '妇科超声')]).complete, true);
});
