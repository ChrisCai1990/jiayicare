// Fail closed for the explicitly isolated acceptance UI; production is unchanged.
export function resolveApiBase(env) {
  if (env.VITE_ISOLATED_ACCEPTANCE !== 'true') return env.VITE_API_URL || 'https://jiaycare.com/api'
  if (env.VITE_API_URL !== 'http://127.0.0.1:3000/api') {
    throw new Error('隔离验收只能连接本机测试API，请检查启动配置')
  }
  return env.VITE_API_URL
}
