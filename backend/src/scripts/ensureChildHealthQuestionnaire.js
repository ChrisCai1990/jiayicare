require('dotenv').config();
const mongoose = require('mongoose');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const { buildChildQuestionnaireTemplate } = require('../utils/childQuestionnaireTemplate');

const KEY = 'child-health-age-standard-v1';
const apply = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const template = buildChildQuestionnaireTemplate();
    const existing = await DynamicQuestionnaire.findOne({ standardTemplateKey: KEY }).lean();
    if (existing) {
      const answers = await QuestionnaireResponse.countDocuments({ questionnaire: existing._id });
      const actual = (existing.questions || []).map(q => [q.id, q.archiveField, q.text, q.type, q.ageStages || [], q.required]);
      const expected = template.questions.map(q => [q.id, q.archiveField, q.text, q.type, q.ageStages || [], q.required]);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        if (answers) throw new Error('现有标准儿童问卷已有答卷，不能原地修订；请发布新问卷版本');
        console.log(JSON.stringify({ status: apply ? 'updating' : 'needs_update', id: String(existing._id), responseCount: answers,
          currentQuestionCount: actual.length, expectedQuestionCount: expected.length }));
        if (!apply) return;
        // 无答卷时才允许原地补题，保留已经定向推送的问卷实例。
        const latestAnswers = await QuestionnaireResponse.countDocuments({ questionnaire: existing._id });
        if (latestAnswers) throw new Error('修订前产生新答卷，停止更新');
        const result = await DynamicQuestionnaire.updateOne({ _id: existing._id, updatedAt: existing.updatedAt,
          status: 'active', respondedUsers: { $size: 0 } }, { $set: {
          title: template.title, description: template.description, questions: template.questions,
        } });
        if (result.modifiedCount !== 1) throw new Error('问卷状态已变化，停止更新并请重新检查');
        console.log(JSON.stringify({ status: 'updated', id: String(existing._id), questionCount: expected.length }));
        return;
      }
      console.log(JSON.stringify({ status: 'exists', id: String(existing._id), title: existing.title, active: existing.status === 'active', responseCount: answers }));
      return;
    }
    console.log(JSON.stringify({ status: apply ? 'creating' : 'missing', key: KEY, title: template.title, questionCount: template.questions.length, targetType: 'specific' }));
    if (!apply) return;
    const created = await DynamicQuestionnaire.create({ ...template, standardTemplateKey: KEY,
      status: 'active', targetUsers: [], respondedUsers: [], scoringEnabled: false });
    console.log(JSON.stringify({ status: 'created', id: String(created._id), title: created.title, active: true }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
