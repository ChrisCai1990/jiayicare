// Dry run by default. Use --apply after reviewing the reported patient and field counts.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../src/models/DynamicQuestionnaire');
const { buildMutation, importBaseline } = require('../src/utils/dietarySurveyBaseline');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const apply = process.argv.includes('--apply');
  const patientArg = process.argv.find(arg => arg.startsWith('--patient-id='));
  const patientId = patientArg?.slice('--patient-id='.length);
  if (patientId && !mongoose.isValidObjectId(patientId)) throw new Error('Invalid patient ID');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  try {
    const questionnaireId = '6a49eab9fc1595013da70645';
    const questionnaire = await DynamicQuestionnaire.findById(questionnaireId).lean();
    if (!questionnaire) throw new Error('Dietary questionnaire not found');
    const query = { questionnaire: questionnaireId, ...(patientId ? { user: patientId } : {}) };
    const seen = new Set();
    const report = { responses: 0, patients: 0, fields: 0, byField: {}, conflicts: 0 };
    for await (const response of QuestionnaireResponse.find(query).sort({ submittedAt: 1, _id: 1 }).lean().cursor()) {
      report.responses++;
      const key = String(response.user);
      if (seen.has(key)) continue; // The first submitted survey establishes the baseline.
      seen.add(key);
      const user = await User.findById(response.user).lean();
      if (!user) continue;
      const mutation = buildMutation(user, questionnaire, response);
      if (!mutation) continue;
      report.patients++;
      const fieldCount = Object.keys(mutation.update.$set).length - 1;
      report.fields += fieldCount;
      for (const path of Object.keys(mutation.update.$set).filter(path => path.startsWith('lifestyle_data.'))) {
        report.byField[path] = (report.byField[path] || 0) + 1;
      }
      if (apply) {
        try {
          await importBaseline(User, response.user, questionnaire, response);
          await User.collection.updateOne({ _id: response.user, 'dietaryBaselineImportPending.responseId': response._id },
            { $unset: { dietaryBaselineImportPending: '' } });
        } catch (error) {
          report.conflicts++;
          console.error(`Patient ${key}: ${error.message}`);
        }
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', patientId: patientId || 'all', ...report }));
    if (report.conflicts) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
