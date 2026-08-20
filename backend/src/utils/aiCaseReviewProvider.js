const { chat, selectProvider } = require('./ai');
const workbuddy = require('./workbuddy');

function availableProviders() {
  return {
    workbuddy: workbuddy.configured(),
    qwen: Boolean(process.env.QWEN_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  };
}

function select(preferred = 'auto') {
  const available = availableProviders();
  if (preferred !== 'auto') {
    if (!available[preferred]) throw new Error(`${preferred} 尚未完成测试环境配置`);
    return preferred;
  }
  if (available.workbuddy) return 'workbuddy';
  return selectProvider();
}

async function reply({ preferred, sessionId, prompt, context, attachments, history }) {
  const startedAt = Date.now();
  const provider = select(preferred);
  if (!provider) throw new Error('测试环境尚未配置可用AI供应商');
  if (provider === 'workbuddy') {
    const result = await workbuddy.runAgent({ sessionId, message: prompt, context, attachments });
    return { provider, model: 'enterprise-agent', sessionId: result.sessionId, content: result.content, files: result.files, durationMs: Date.now() - startedAt };
  }
  const systemPrompt = '你是医护团队的AI辅助研判助手。只能根据提供的客户资料和讨论进行分析；区分档案事实、合理推测和缺失信息；不得补造诊断、检查、数值或用药事实。输出专业、清晰、便于医护人员复核的中文。';
  const messages = [...(history || []).slice(-12), { role: 'user', content: `${prompt}\n\n【本轮客户资料快照】\n${JSON.stringify(context).slice(0, 45000)}` }];
  const content = await chat(messages, { provider, systemPrompt, maxTokens: 1800, temperature: 0.05, timeoutMs: 90000 });
  return { provider, model: provider === 'deepseek' ? 'deepseek-chat' : 'qwen-plus', sessionId, content, files: [], durationMs: Date.now() - startedAt };
}

module.exports = { availableProviders, reply };
