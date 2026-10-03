const template = require('../../../shared/childHealthQuestionnaireTemplate.json');
const dropdownOptions = {
  hearingScreening: ['通过', '未通过', '未查'],
  bloodTypeABO: ['A', 'B', 'O', 'AB'],
  bloodTypeRH: ['阳性', '阴性'],
};
const archivePath = key => ['bloodTypeABO', 'bloodTypeRH'].includes(key) ? key : `childProfile.${key}`;

function buildChildQuestionnaireTemplate() {
  return {
    title: template.title, description: template.description,
    patientCategory: 'child', archivePurpose: 'child_health',
    targetType: 'specific', questions: template.fields.map(([key, text, type, ageStages = []]) => ({
      id: `child_${key}`, archiveField: archivePath(key), text, type, ageStages, required: false,
      ...(type === 'dropdown' ? { options: (dropdownOptions[key] || []).map(label => ({ label, allowInput: false, exclusive: false, score: 0 })) } : {}),
    })),
  };
}

module.exports = { buildChildQuestionnaireTemplate };
