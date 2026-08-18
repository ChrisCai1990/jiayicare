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

function getMongoDatabaseName(uri) {
  const value = String(uri || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  } catch {
    return '';
  }
}

// 长期预发布环境必须同时满足数据库、OSS、监听地址和定时任务四重边界。
// 当前生产在迁移完成前允许不声明 DEPLOYMENT_ENV，以保证加入门禁本身不触发生产重启。
function assertDeploymentEnvironment(env = process.env) {
  const deploymentEnv = String(env.DEPLOYMENT_ENV || '').trim().toLowerCase();
  if (!deploymentEnv) return { deploymentEnv: 'legacy-production' };
  if (!['production', 'staging'].includes(deploymentEnv)) {
    throw new Error(`DEPLOYMENT_ENV 仅允许 production 或 staging，当前为“${deploymentEnv}”`);
  }
  const databaseName = getMongoDatabaseName(env.MONGODB_URI);
  const reportUploadFolder = getReportUploadFolder(env);
  const port = Number(env.PORT);

  if (deploymentEnv === 'production') {
    if (databaseName !== 'jiayicare') throw new Error(`生产环境拒绝连接数据库“${databaseName || '未指定'}”`);
    if (reportUploadFolder !== 'reports') throw new Error('生产环境的 REPORT_UPLOAD_FOLDER 必须为 reports');
    if (port !== 3000) throw new Error('生产环境必须使用端口 3000');
    if (areSchedulersDisabled(env)) throw new Error('生产环境不得禁用定时任务');
    return { deploymentEnv, databaseName, reportUploadFolder, bindHost: String(env.BIND_HOST || ''), port };
  }

  if (databaseName !== 'jiayicare_staging') {
    throw new Error(`预发布环境拒绝连接数据库“${databaseName || '未指定'}”`);
  }
  if (!reportUploadFolder.startsWith('reports-staging/')) {
    throw new Error('预发布环境的 REPORT_UPLOAD_FOLDER 必须位于 reports-staging/ 下');
  }
  if (!areSchedulersDisabled(env)) {
    throw new Error('预发布环境必须设置 DISABLE_SCHEDULERS=true');
  }
  if (String(env.BIND_HOST || '').trim() !== '127.0.0.1') {
    throw new Error('预发布环境必须仅监听 127.0.0.1');
  }
  if (!Number.isInteger(port) || port <= 0 || port === 3000) {
    throw new Error('预发布环境必须使用非生产端口');
  }

  return { deploymentEnv, databaseName, reportUploadFolder, bindHost: '127.0.0.1', port };
}

module.exports = { areSchedulersDisabled, getReportUploadFolder, getMongoDatabaseName, assertDeploymentEnvironment };
