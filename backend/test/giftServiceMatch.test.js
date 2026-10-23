const test = require('node:test');
const assert = require('node:assert/strict');
const { giftCoversMedicalService } = require('../src/utils/giftServiceMatch');

test('catalog gifts only cover matching medical service workflows', () => {
  assert.equal(giftCoversMedicalService('医疗代诊服务', '医疗代诊服务'), true);
  assert.equal(giftCoversMedicalService('医疗代诊服务', '专家约诊服务'), false);
  assert.equal(giftCoversMedicalService('医务代办服务', '医务代办服务'), true);
  assert.equal(giftCoversMedicalService('医务代办服务', '代配药服务'), true);
  assert.equal(giftCoversMedicalService('医务代办服务', '医疗代诊服务'), false);
  assert.equal(giftCoversMedicalService('就医陪同服务', '陪同看诊服务'), true);
  assert.equal(giftCoversMedicalService('就医陪同服务', '陪同检查服务'), false);
  assert.equal(giftCoversMedicalService('就医协助服务', '专家约诊服务'), true);
});
