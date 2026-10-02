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
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('现有标准儿童问卷与当前模板不一致，请人工核对后发布新版本');
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
