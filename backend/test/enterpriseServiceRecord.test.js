const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateInput, privateDirectory, TYPES } = require('../src/utils/enterpriseServiceRecord');

const base = { year: '2026', period: 'annual', kind: 'annual_plan', title: '年度服务方案', summary: '' };
const pdf = { originalname: '年度方案.pdf', mimetype: TYPES['.pdf'] };
const pptx = { originalname: '年度方案.pptx', mimetype: TYPES['.pptx'] };

test('年度方案接受PDF和PPTX，季度复盘须归入具体季度', () => {
  assert.equal(validateInput(base, pdf), null);
  assert.equal(validateInput(base, pptx), null);
  assert.equal(validateInput({ ...base, kind: 'quarterly_review' }, pdf), '季度复盘请选择对应季度');
  assert.equal(validateInput({ ...base, kind: 'quarterly_review', period: 'Q2' }, pdf), null);
});

test('拒绝扩展名与MIME不符及无效年度，私有目录不在公开上传目录内', () => {
  assert.equal(validateInput(base, { ...pdf, originalname: '方案.pptx' }), '仅支持PDF或PPTX文件');
  assert.equal(validateInput({ ...base, year: '2026.5' }, pdf), '请选择有效的服务年度');
  const previous = process.env.UPLOADS_DIR;
  const override = process.env.ENTERPRISE_SERVICE_RECORDS_DIR;
  try {
    process.env.UPLOADS_DIR = path.join('C:', 'site', 'uploads');
    delete process.env.ENTERPRISE_SERVICE_RECORDS_DIR;
    assert.notEqual(privateDirectory(), process.env.UPLOADS_DIR);
    assert.equal(path.dirname(privateDirectory()), path.dirname(process.env.UPLOADS_DIR));
    process.env.ENTERPRISE_SERVICE_RECORDS_DIR = path.join(process.env.UPLOADS_DIR, 'private');
    assert.throws(() => privateDirectory(), /不能位于公开上传目录内/);
  } finally {
    if (previous === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previous;
    if (override === undefined) delete process.env.ENTERPRISE_SERVICE_RECORDS_DIR;
    else process.env.ENTERPRISE_SERVICE_RECORDS_DIR = override;
  }
});
