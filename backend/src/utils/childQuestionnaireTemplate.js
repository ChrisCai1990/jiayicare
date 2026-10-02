const template = require('../../../shared/childHealthQuestionnaireTemplate.json');

function buildChildQuestionnaireTemplate() {
  return {
    title: template.title, description: template.description,
    patientCategory: 'child', archivePurpose: 'child_health',
    targetType: 'specific', questions: template.fields.map(([key, text, type, ageStages = []]) => ({
      id: `child_${key}`, archiveField: `childProfile.${key}`, text, type, ageStages, required: false,
      ...(type === 'dropdown' ? { options: ['通过', '未通过', '未查'].map(label => ({ label, allowInput: false, exclusive: false, score: 0 })) } : {}),
    })),
  };
}

module.exports = { buildChildQuestionnaireTemplate };
