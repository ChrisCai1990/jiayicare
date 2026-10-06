const { chat } = require('./ai');
const { prepareContext } = require('./aiCaseReviewPayload');

function availableProviders() {
  return {
    qwen: Boolean(process.env.QWEN_API_KEY),
  };
}

function select() {
  if (!process.env.QWEN_API_KEY) throw new Error('AI辅助研判测试需要配置 QWEN_API_KEY');
  return 'qwen';
}

async function reply({ preferred, sessionId, prompt, context, attachments, history, maxTokens = 1800, retryOnEmptyOrLength = false }) {
  const startedAt = Date.now();
  const provider = select(preferred);
  const imageReading = attachments?.length
    ? await require('./aiCaseReviewAttachments').readAttachmentImages(attachments) : '';
  const contextSnapshot = prepareContext(imageReading ? {
    ...context,
    sources: [...(context?.sources || []), `本轮上传的 ${attachments.length} 张报告原图（已逐张视觉识别，待人工核实）`],
    attachmentReadings: imageReading,
  } : context);
  const systemPrompt = '你是医护团队的AI辅助研判助手。只能根据提供的客户资料和讨论进行分析；区分档案事实、合理推测和缺失信息；不得补造诊断、检查、数值或用药事实。最新资料快照优先于旧AI回复。medications和supplements为独立结构化记录，必须核对名称、剂量、频次、日期、停用及审核状态；recentMedication等档案字段为空不能否定这些记录。未选入或被压缩省略的信息不等于确认无，不得猜测系统映射故障或声称已创建任务。输出专业、清晰、便于医护人员复核的中文。';
  const messages = [...(history || []).slice(-12), { role: 'user', content: `${prompt}\n\n【本轮客户资料快照】\n${JSON.stringify(contextSnapshot)}` }];
  let content;
  try {
    content = await chat(messages, { provider, systemPrompt, maxTokens, temperature: 0.05, timeoutMs: 90000 });
  } catch (error) {
    if (!retryOnEmptyOrLength || !/AI 返回空内容或输出被截断/.test(String(error.message || ''))) throw error;
    const retryMessages = [...messages.slice(0, -1), { role: 'user', content: `${messages.at(-1).content}\n\n【精简重试】上次输出未完成。请直接给出完整问题卡；每个问题最多180字，每个字段只写最关键的一句，最后写综合关联和优先级。不要重复资料清单、引言或解释格式。` }];
    content = await chat(retryMessages, { provider, systemPrompt, maxTokens: Math.max(maxTokens, 6500), temperature: 0.05, timeoutMs: 120000 });
  }
  return { provider, model: 'qwen-plus', sessionId, content, files: [], contextSnapshot, durationMs: Date.now() - startedAt };
}

module.exports = { availableProviders, reply };
