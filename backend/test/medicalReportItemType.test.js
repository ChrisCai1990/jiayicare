const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MedicalReport = require('../src/models/MedicalReport');

test('legacy pathology itemType is normalized before MedicalReport validation', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '年度体检报告',
    type: 'annual',
    reportItems: [
      { name: '眼科检查', itemType: 'pathology', findings: '眼睑：健康' },
      { name: '耳鼻喉科检查', itemType: 'pathology', findings: '耳部：未见明显异常' },
    ],
  });

  assert.equal(report.validateSync(), undefined);
  assert.deepEqual(report.reportItems.map(item => item.itemType), ['imaging', 'imaging']);
});

test('unknown itemType remains invalid instead of being silently accepted', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '年度体检报告',
    reportItems: [{ name: '未知项目', itemType: 'unexpected' }],
  });

  assert.match(report.validateSync().message, /itemType/);
});

test('legacy uploads do not receive an empty idempotency key', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '旧版客户端上传报告',
  });

  assert.equal(report.uploadRequestId, undefined);
  assert.equal(report.toObject().uploadRequestId, undefined);
});
