function areSchedulersDisabled(env = process.env) {
  return String(env.DISABLE_SCHEDULERS || '').trim().toLowerCase() === 'true';
}

function getReportUploadFolder(env = process.env) {
  const folder = String(env.REPORT_UPLOAD_FOLDER || 'reports').trim().replace(/^\/+|\/+$/g, '');
  if (!folder || folder.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(folder)) {
    throw new Error('REPORT_UPLOAD_FOLDER 配置不安全');
  }
  return folder;
}

module.exports = { areSchedulersDisabled, getReportUploadFolder };
