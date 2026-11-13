// Explicit operator command; default is read-only. No customer answers are generated.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const { KEY, TITLE, QUESTIONS } = require('../utils/sleepIntake');
const { TEMPLATE_ID, pushSleepIntake } = require('../utils/sleepIntakePush');
const { runWithoutTenantScope } = require('../utils/tenantScope');
async function main() {
  const mode = process.argv[2] || 'preview';
  if (!['preview','seed','backfill'].includes(mode)) throw new Error('mode: preview / seed / backfill');
  await mongoose.connect(process.env.MONGODB_URI);
  await runWithoutTenantScope(async () => {
    const tenantId = await require('../utils/jiayihuiTenant').jiayihuiTenantId();
    if (!tenantId) throw new Error('嘉医汇机构未配置');
    const User = require('../models/User'); const Admin = require('../models/Admin'); const Push = require('../models/PushRecord');
    const { DynamicQuestionnaire: Q, QuestionnaireResponse: R } = require('../models/DynamicQuestionnaire');
    if (mode === 'seed') {
      const existing = await Q.findById(TEMPLATE_ID).lean();
      if (existing && existing.standardTemplateKey !== KEY) throw new Error('模板ID冲突');
      const owner = await Admin.findOne({ tenantId, role: 'superadmin' }).select('_id');
      if (!owner) throw new Error('缺少机构管理账号');
      await Q.updateOne({ _id: TEMPLATE_ID }, { $setOnInsert: { title: TITLE, description: '本问卷用于了解您的睡眠习惯和服务需求，不是诊断量表，不计算健康分数。请按最近两周的实际情况填写，不确定时可以选择暂时说不清。',
        standardTemplateKey: KEY, questions: QUESTIONS, status: 'active', patientCategory: 'adult', targetType: 'specific', targetUsers: [], scoringEnabled: false, createdBy: owner._id } }, { upsert: true });
      console.log(JSON.stringify({ templateId: TEMPLATE_ID, seeded: true })); return;
    }
    const users = await User.find({ tenantId, onboardingCompleted: true, isDeleted: { $ne: true }, patientCategory: { $ne: 'child' }, 'reviewExperience.enabled': { $ne: true } }).select('_id assignedHealthManager').lean();
    const counts = {}; const results = [];
    for (const user of users) {
      let state;
      if (mode === 'backfill') state = await pushSleepIntake(user._id);
      else if (await R.exists({ user: user._id, questionnaire: TEMPLATE_ID })) state = 'answered';
      else if (await Push.exists({ patientId: user._id, questionnaireId: TEMPLATE_ID })) state = 'already_pushed';
      else if (!await Admin.exists({ _id: user.assignedHealthManager, tenantId }) && !await Admin.exists({ tenantId, role: 'superadmin' })) state = 'missing_operator';
      else state = 'eligible';
      counts[state] = (counts[state] || 0) + 1;
      results.push({ userId: String(user._id), state });
    }
    console.log(JSON.stringify({ mode, tenantId: String(tenantId), templateId: TEMPLATE_ID, counts, results }));
  });
}
main().catch(e => { console.error(e.message); process.exitCode=1; }).finally(() => mongoose.disconnect());
