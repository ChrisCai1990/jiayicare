const { chat } = require('./ai');

function availableProviders() {
  return {
    qwen: Boolean(process.env.QWEN_API_KEY),
  };
}

function select() {
  if (!process.env.QWEN_API_KEY) throw new Error('AI辅助研判测试需要配置 QWEN_API_KEY');
  return 'qwen';
}

async function reply({ preferred, sessionId, prompt, context, attachments, history }) {
  const startedAt = Date.now();
  const provider = select(preferred);
  const systemPrompt = '你是医护团队的AI辅助研判助手。只能根据提供的客户资料和讨论进行分析；区分档案事实、合理推测和缺失信息；不得补造诊断、检查、数值或用药事实。输出专业、清晰、便于医护人员复核的中文。';
  const messages = [...(history || []).slice(-12), { role: 'user', content: `${prompt}\n\n【本轮客户资料快照】\n${JSON.stringify(context).slice(0, 45000)}` }];
  const content = await chat(messages, { provider, systemPrompt, maxTokens: 1800, temperature: 0.05, timeoutMs: 90000 });
  return { provider, model: 'qwen-plus', sessionId, content, files: [], durationMs: Date.now() - startedAt };
}

module.exports = { availableProviders, reply };
