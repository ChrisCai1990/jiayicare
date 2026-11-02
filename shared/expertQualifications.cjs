const certificateTypes = {
  qualification: '医师资格证', practice: '医师执业证', title: '职称证',
  education: '学历／毕业证', degree: '学位证', other: '其他专业资质',
};
const languageLevels = { consultation: '可直接进行专业咨询', interpreter: '可日常交流，专业咨询需翻译', reading: '仅可阅读专业资料' };
function normalizeLanguages(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) throw new Error('服务语言最多填写12项');
  const result = value.map(item => ({ language: String(item?.language || '').trim(), level: item?.level }));
  if (result.some(item => !item.language || item.language.length > 40 || !languageLevels[item.level]) || new Set(result.map(x => x.language)).size !== result.length)
    throw new Error('请填写不重复的语言名称，并选择对应能力');
  return result;
}
module.exports = { certificateTypes, languageLevels, normalizeLanguages };
