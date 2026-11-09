// Original service intake; no licensed instrument, clinical score or diagnostic threshold.
const KEY = 'jiayihui_sleep_intake_v1';
const TITLE = '嘉医汇睡眠情况问卷';
const question = (id, text, labels, required = true) => ({ id, text, type: labels ? 'radio' : 'text', required, scoreEnabled: false, ...(labels ? { options: labels.map(label => ({ label })) } : {}) });
const QUESTIONS = [
  question('routine', '最近两周，您的作息通常属于哪种情况？', ['作息大致固定', '经常变化', '有轮班或夜班', '暂时说不清']),
  question('schedule', '如果方便，请描述通常什么时候休息、什么时候起床。', null, false),
  question('rested', '最近两周，醒来后您通常感觉休息得怎么样？', ['大多休息得不错', '有时仍觉得疲惫', '经常觉得没休息好', '暂时说不清']),
  question('concern', '目前是否有睡眠方面的困扰，希望与我们沟通？', ['没有明显困扰', '有，希望进一步沟通', '暂时不确定']),
  question('concern_details', '您最想改善的睡眠情况是什么？可以按自己的感受描述。', null, false),
  question('daytime', '最近两周，睡眠情况是否影响了您的白天生活或工作？', ['没有明显影响', '有一些影响', '影响比较明显', '暂时说不清']),
  question('context', '有哪些生活安排或环境因素让您难以好好休息？', null, false),
  question('support', '关于睡眠，您希望我们提供什么帮助？', ['先记录，暂不需要联系', '希望健管专员联系了解', '希望了解进一步专业咨询的安排']),
  question('additional', '还有其他希望补充的信息吗？', null, false),
];
function validate(answers, questions = QUESTIONS) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('问卷答案格式无效');
  const clean = {};
  for (const q of questions) {
    const value = answers[q.id];
    if (value == null || value === '') { if (q.required !== false) throw new Error(`请完成：${q.text}`); continue; }
    if (typeof value !== 'string' || value.length > 2000) throw new Error('请使用不超过2000字的文字回答');
    if (q.type === 'radio' && !q.options.some(o => o.label === value)) throw new Error(`请选择有效选项：${q.text}`);
    clean[q.id] = value;
  }
  return clean;
}
function record(response) {
  const snapshot = response.questionnaireSnapshot;
  if (snapshot?.standardTemplateKey !== KEY) throw new Error('睡眠问卷缺少原始版本');
  return { id: String(response._id), title: snapshot.title, version: KEY, completedAt: response.submittedAt,
    answers: snapshot.questions.map(q => ({ question: q.text, answer: response.answers?.[q.id] || '未填写（选填）' })) };
}
async function archive(User, userId, response) {
  const row = record(response);
  const r = await User.updateOne({ _id: userId, isDeleted: { $ne: true } }, { $set: { [`sleepIntakeRecords.${row.id}`]: row } });
  if (!r.matchedCount) throw new Error('睡眠记录未写入，请稍后重试');
}
module.exports = { KEY, TITLE, QUESTIONS, validate, record, archive };
