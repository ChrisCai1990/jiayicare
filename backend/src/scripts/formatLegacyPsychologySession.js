const mongoose = require('mongoose');
const crypto = require('node:crypto');
const labels = ['本次咨询主诉问题', '问题评估', '咨询过程', '风险及后续建议'];
function formatLegacy(content) {
  if (typeof content !== 'string' || content.includes('【上次咨询回顾反馈】')) return null;
  const matches = [...content.matchAll(/^(本次咨询主诉问题|问题评估|咨询过程|风险及后续建议)[：:]/gm)];
  if (matches.length !== 4 || matches[0].index !== 0 || matches.some((m, i) => m[1] !== labels[i])) throw new Error('旧记录标题不符合可安全整理的格式');
  const sections = matches.map((m, i) => content.slice(m.index + m[0].length, matches[i + 1]?.index ?? content.length).trim());
  if (sections.some(s => !s)) throw new Error('旧记录存在空段落');
  return ['【上次咨询回顾反馈】\n原记录未填写。', ...sections.map((s, i) => `【${i === 2 ? '咨询过程与进展' : labels[i]}】\n${s}`)].join('\n\n');
}
async function main() {
  require('dotenv').config({ quiet: true });
  const [careId, sessionId, mode] = process.argv.slice(2);
  if (![careId, sessionId].every(mongoose.isValidObjectId) || !['--dry-run', '--apply'].includes(mode)) throw new Error('需要指定档案ID、记录ID和--dry-run或--apply');
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  try {
    const C = require('../models/PsychologyCare');
    const care = await C.collection.findOne({ _id: new mongoose.Types.ObjectId(careId) });
    const session = care?.sessions.find(s => String(s._id) === sessionId);
    if (!session) throw new Error('指定记录不存在');
    if (session.originalContent) { console.log(JSON.stringify({ status: 'already-formatted', careId, sessionId })); return; }
    const content = formatLegacy(session.content);
    if (!content) throw new Error('该记录不需要旧格式整理');
    const originalHash = crypto.createHash('sha256').update(session.content).digest('hex');
    if (mode === '--apply') {
      const at = new Date();
      const r = await C.collection.updateOne({ _id: care._id, __v: care.__v, sessions: { $elemMatch: { _id: session._id, content: session.content, originalContent: { $exists: false } } } }, {
        $set: { 'sessions.$.originalContent': session.content, 'sessions.$.content': content, 'sessions.$.reformattedAt': at, updatedAt: at },
        $inc: { __v: 1 },
        $push: { history: { action: 'session_format_adjustment', reason: '按用户要求整理为五分类；保留原文，未填写项标注缺失', at } },
      });
      if (r.modifiedCount !== 1) throw new Error('记录已变化，未执行更新，请重新核对');
      const saved = await C.collection.findOne({ _id: care._id });
      const checked = saved.sessions.find(s => String(s._id) === sessionId);
      if (checked.originalContent !== session.content || checked.content !== content) throw new Error('回读校验失败');
    }
    console.log(JSON.stringify({ status: mode === '--apply' ? 'applied-and-verified' : 'ready', careId, sessionId, originalHash, originalLength: session.content.length, formattedLength: content.length }));
  } finally { await mongoose.disconnect(); }
}
module.exports = { formatLegacy };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
