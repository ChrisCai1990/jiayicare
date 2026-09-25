const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MedicalReport = require('../src/models/MedicalReport');

test('legacy narrative itemType values are normalized before MedicalReport validation', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '年度体检报告',
    type: 'annual',
    reportItems: [
      { name: '眼科检查', itemType: 'pathology', findings: '眼睑：健康' },
      { name: '耳鼻喉科检查', itemType: 'pathology', findings: '耳部：未见明显异常' },
      { name: '超声诊断', itemType: 'diagnosis', diagnosis: '未见明显异常' },
    ],
  });

  assert.equal(report.validateSync(), undefined);
  assert.deepEqual(report.reportItems.map(item => item.itemType), ['imaging', 'imaging', 'imaging']);
});

test('unknown itemType remains invalid instead of being silently accepted', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '年度体检报告',
    reportItems: [{ name: '未知项目', itemType: 'unexpected' }],
  });

  assert.match(report.validateSync().message, /itemType/);
});

test('legacy low-risk statuses are normalized before MedicalReport validation', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '年度体检报告',
    reportItems: [
      { name: '项目一', status: 'low risk' },
      { name: '项目二', status: 'low' },
      { name: '项目三', status: 'LOW_RISK' },
    ],
  });

  assert.equal(report.validateSync(), undefined);
  assert.deepEqual(report.reportItems.map(item => item.status), ['normal', 'normal', 'normal']);
});

test('unknown report item status remains invalid instead of being silently accepted', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '年度体检报告',
    reportItems: [{ name: '未知项目', status: 'maybe' }],
  });

  assert.match(report.validateSync().message, /status/);
});

test('report items retain their own examination date for multi-date uploads', () => {
  const report = new MedicalReport({
    user: new mongoose.Types.ObjectId(),
    title: '合并上传的检查资料',
    reportItems: [
      { name: '甲状腺超声', itemType: 'imaging', examDate: '2025-05-01' },
      { name: '糖化血红蛋白', itemType: 'lab', examDate: '2025-05-03' },
    ],
  });

  assert.equal(report.validateSync(), undefined);
  assert.deepEqual(report.reportItems.map(item => item.examDate), ['2025-05-01', '2025-05-03']);
});
