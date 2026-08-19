const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  collectionCopyPolicy,
  sanitizeDocument,
  stableAlias,
} = require('../src/utils/stagingDataSanitizer');

const salt = 'unit-test-only-salt';

test('authentication, communication and payment collections are excluded', () => {
  for (const name of ['messages', 'chatlogs', 'payments', 'verificationcodes', 'sharetokens']) {
    assert.equal(collectionCopyPolicy(name), 'exclude');
  }
  assert.equal(collectionCopyPolicy('admins'), 'sanitize');
  assert.equal(collectionCopyPolicy('medicalreports'), 'sanitize');
});

test('staff references remain resolvable but copied staff accounts cannot log in', () => {
  const id = new mongoose.Types.ObjectId();
  const result = sanitizeDocument('admins', {
    _id: id,
    username: 'jy_hm',
    password: '$2b$10$production-hash',
    name: '李医生',
    phone: '13800138000',
    role: 'healthManager',
    staffStatus: 'active',
  }, { salt });
  assert.equal(String(result._id), String(id));
  assert.match(result.username, /^staging_[a-f0-9]{10}$/);
  assert.equal(result.name, stableAlias('测试医护', id, salt));
  assert.equal('password' in result, false);
  assert.equal('phone' in result, false);
  assert.equal(result.role, 'healthManager');
  assert.equal(result.staffStatus, 'inactive');
  assert.equal(result.mustChangePassword, true);
});

test('member identity and nested contact data are deterministically anonymized', () => {
  const id = new mongoose.Types.ObjectId();
  const source = {
    _id: id,
    name: '夏小波',
    nickname: '小波',
    phone: '13800138000',
    idNumber: '330102199001011234',
    wechatOpenid: 'openid-secret',
    address: '杭州市某小区',
    emergencyContact: { contactName: '家属', contactPhone: '13900139000' },
    healthConcern: '联系电话13800138000，邮箱 x@example.com',
  };
  const result = sanitizeDocument('users', source, { salt });
  assert.equal(result.name, stableAlias('测试会员', id, salt));
  assert.equal(result.nickname, result.name);
  assert.equal('phone' in result, false);
  assert.equal('idNumber' in result, false);
  assert.equal('wechatOpenid' in result, false);
  assert.equal('address' in result, false);
  assert.equal('contactName' in result.emergencyContact, false);
  assert.equal('contactPhone' in result.emergencyContact, false);
  assert.match(result.healthConcern, /\[手机号已脱敏\]/);
  assert.match(result.healthConcern, /\[邮箱已脱敏\]/);
  assert.equal(result.stagingAnonymized, true);
});

test('report facts and references remain while original health files are removed', () => {
  const reportId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const revisionId = new mongoose.Types.ObjectId();
  const source = {
    _id: reportId,
    user: userId,
    currentRevisionId: revisionId,
    title: '夏小波年度体检报告',
    fileUrl: 'https://bucket.example/reports/private.pdf',
    fileUrls: ['https://bucket.example/reports/private.pdf'],
    ossKey: 'reports/private.pdf',
    ossKeys: ['reports/private.pdf'],
    content: 'data:application/pdf;base64,secret',
    originalEvidence: { files: [{ ossKey: 'reports/private.pdf' }] },
    reportItems: [{ name: '空腹血糖', value: '5.2', evidenceText: '夏小波 13800138000' }],
  };
  const result = sanitizeDocument('medicalreports', source, {
    salt,
    nameReplacements: [{ source: '夏小波', alias: '测试会员-abc' }],
  });
  assert.equal(String(result.user), String(userId));
  assert.equal(String(result.currentRevisionId), String(revisionId));
  assert.equal('fileUrl' in result, false);
  assert.equal('fileUrls' in result, false);
  assert.equal('ossKey' in result, false);
  assert.equal('ossKeys' in result, false);
  assert.equal('content' in result, false);
  assert.equal('originalEvidence' in result, false);
  assert.equal(result.reportItems[0].value, '5.2');
  assert.equal(result.reportItems[0].evidenceText, '测试会员-abc [手机号已脱敏]');
});
