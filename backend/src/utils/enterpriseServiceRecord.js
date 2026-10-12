const path = require('path');

const TYPES = {
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function validateInput(body, file) {
  const year = Number(body?.year);
  const period = String(body?.period || '');
  const kind = String(body?.kind || '');
  const title = String(body?.title || '').trim();
  const summary = String(body?.summary || '').trim();
  if (!Number.isInteger(year) || year < 2020 || year > 2099) return '请选择有效的服务年度';
  if (!['annual', 'Q1', 'Q2', 'Q3', 'Q4'].includes(period)) return '请选择全年或季度';
  if (!['annual_plan', 'quarterly_review', 'annual_review', 'other'].includes(kind)) return '请选择记录类型';
  if (kind === 'quarterly_review' && period === 'annual') return '季度复盘请选择对应季度';
  if (kind !== 'quarterly_review' && period !== 'annual' && kind !== 'other') return '年度记录请选择全年';
  if (!title || title.length > 120) return '标题须为1至120字';
  if (summary.length > 2000) return '说明不能超过2000字';
  if (!file) return '请选择PDF或PPTX文件';
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!TYPES[extension] || file.mimetype !== TYPES[extension]) return '仅支持PDF或PPTX文件';
  return null;
}

function privateDirectory() {
  const uploads = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads'));
  const directory = path.resolve(process.env.ENTERPRISE_SERVICE_RECORDS_DIR || path.join(path.dirname(uploads), 'private-enterprise-service-records'));
  const relative = path.relative(uploads, directory);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('ENTERPRISE_SERVICE_RECORDS_DIR 不能位于公开上传目录内');
  }
  return directory;
}

module.exports = { validateInput, privateDirectory, TYPES };
