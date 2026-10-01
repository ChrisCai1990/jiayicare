const fields = [['facts','客观评估结论'],['risks','重点关注'],['missingInformation','待补信息'],['recommendations','管理建议']];
const invalid = message => Object.assign(new Error(message), {statusCode:400});
function clean(value = {}, submit = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('评估字段格式无效');
  const result = {};
  for (const key of ['domain','title',...fields.map(f=>f[0])]) {
    if (value[key] != null && typeof value[key] !== 'string') throw invalid('评估字段格式无效');
    result[key] = (value[key] || '').trim();
    if (result[key].length > 10000) throw invalid('评估内容过长');
  }
  if (submit && (!result.title || !result.facts)) throw invalid('请填写评估标题及客观评估结论');
  return result;
}
const summary = value => [value.title,...fields.map(([key,label])=>value[key] ? `${label}：\n${value[key]}` : '')].filter(Boolean).join('\n\n');
module.exports = {fields,clean,summary};
