const TARGETS = {
  '6a15585082ac0cfb2e0f8961': '健康问卷表（成人）',
  '6a153bef1cf80401d65a7bfa': '健康问卷表（6-18岁）',
};
const questions = [
  { id: 'care_residence_city', type: 'text', text: '常住城市（选填）', archiveField: 'residence.city', placeholder: '如：杭州市' },
  { id: 'care_preferred_city', type: 'text', text: '首选就医城市（选填）', archiveField: 'carePreferences.city', placeholder: '可填写多个城市，以顿号分隔；不填则沿用常住城市' },
  { id: 'care_preferred_hospital', type: 'text', text: '偏好医院（选填）', archiveField: 'carePreferences.hospitals', placeholder: '可填写多家，以顿号分隔；无偏好可留空' },
  { id: 'care_allow_travel', type: 'radio', text: '是否接受异地就医（选填）', archiveField: 'carePreferences.allowTravel', options: [{ label: '接受' }, { label: '不接受' }, { label: '暂不确定' }] },
].map(q => ({ ...q, required: false, scoreEnabled: false }));
function additions(template) {
  if (TARGETS[String(template._id)] !== template.title) throw new Error('建档问卷ID或标题不匹配');
  return questions.filter(q => !(template.questions || []).some(old => old.archiveField === q.archiveField)).map(q => {
    if ((template.questions || []).some(old => old.id === q.id)) throw new Error('新增题目ID冲突');
    return q;
  });
}
module.exports = { TARGETS, questions, additions };
