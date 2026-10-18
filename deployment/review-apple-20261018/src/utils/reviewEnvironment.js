// Review credentials must never be enabled against the customer database.
function isReviewEnvironment(env = process.env) {
  return env.REVIEW_ENVIRONMENT === 'isolated';
}

function assertReviewEnvironment(env = process.env) {
  if (!isReviewEnvironment(env)) throw new Error('独立测试环境未启用');
  let uri;
  try { uri = new URL(env.MONGODB_URI); } catch { throw new Error('审核数据库配置无效'); }
  if (uri.protocol !== 'mongodb:' || uri.hostname !== '127.0.0.1' || uri.port !== '27118'
    || uri.pathname !== '/jiayicare_review' || uri.username !== 'review_app'
    || !uri.password || uri.searchParams.get('authSource') !== 'jiayicare_review') {
    throw new Error('审核账号只能使用独立审核数据库');
  }
  if (env.STARTUP_BACKGROUND_JOBS_ENABLED !== 'false' || env.NATIVE_PUSH_ENABLED !== 'false'
    || env.UPLOADS_DIR !== '/var/lib/jiayicare-review/uploads'
    || typeof env.JWT_SECRET !== 'string' || env.JWT_SECRET.length < 48) {
    throw new Error('审核环境隔离配置不完整');
  }
  // The new service gets its own environment, never a copy of production .env.
  for (const key of Object.keys(env)) {
    if (env[key] && /^(WECHAT|WEAPP|WEWORK|WECOM|ALIYUN|OSS|QWEN|DASHSCOPE|ANTHROPIC|OPENAI|HUAWEI|NLS)_/.test(key)) {
      throw new Error('审核环境包含未允许的外部服务配置');
    }
  }
  return true;
}

function assertReviewConnection(connection, env = process.env) {
  assertReviewEnvironment(env);
  if (connection.readyState !== 1 || connection.name !== 'jiayicare_review'
    || connection.host !== '127.0.0.1' || Number(connection.port) !== 27118) {
    throw new Error('审核数据库尚未就绪');
  }
}

module.exports = { isReviewEnvironment, assertReviewEnvironment, assertReviewConnection };
