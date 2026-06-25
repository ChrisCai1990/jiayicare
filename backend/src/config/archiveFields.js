// ── 健康档案字段清单（单一数据源）──────────────────────────────────────
// 用于：①问卷构建器给每题绑定「对应健康档案字段」②问卷答卷自动导入档案的归一化与写入。
// path 为写入 User 文档的字段路径（支持一层嵌套，如 healthProfile.pastHistory / lifestyle.diet）。
// type：text 文本 / array 数组(多选拼成数组) / enum 枚举 / date 日期 / number 数字。
// 与 staff PatientDetailPage 的 buildBasicInfoForm/buildHealthForm/buildHealthNeedsForm/buildLifestyleForm 对齐。

const ARCHIVE_FIELDS = [
  // 基本信息
  { path: 'gender',            label: '性别',         group: '基本信息', type: 'enum', options: ['男', '女', '未知'] },
  { path: 'birthDate',         label: '出生日期',     group: '基本信息', type: 'date' },
  { path: 'idNumber',          label: '身份证号',     group: '基本信息', type: 'text' },
  { path: 'maritalStatus',     label: '婚姻状况',     group: '基本信息', type: 'text' },
  { path: 'ethnicity',         label: '民族',         group: '基本信息', type: 'text' },
  { path: 'workplace',         label: '工作单位',     group: '基本信息', type: 'text' },
  { path: 'occupation',        label: '职业',         group: '基本信息', type: 'text' },
  { path: 'education',         label: '学历',         group: '基本信息', type: 'text' },
  { path: 'hasAnnualCheckup',  label: '是否每年体检', group: '基本信息', type: 'text' },
  { path: 'height',            label: '身高',         group: '基本信息', type: 'text' },
  { path: 'weight',            label: '体重',         group: '基本信息', type: 'text' },
  { path: 'address',           label: '联系地址',     group: '基本信息', type: 'text' },
  { path: 'contactPhone',      label: '联系电话',     group: '基本信息', type: 'text' },
  { path: 'chronicDiseases',   label: '慢性病标签',   group: '基本信息', type: 'array' },

  // 既往健康史
  { path: 'bloodTypeABO',         label: '血型ABO',       group: '既往健康史', type: 'enum', options: ['A', 'B', 'O', 'AB'] },
  { path: 'bloodTypeRH',          label: '血型RH',        group: '既往健康史', type: 'enum', options: ['阳性', '阴性'] },
  { path: 'traumaHistory',        label: '外伤史',        group: '既往健康史', type: 'text' },
  { path: 'transfusionHistory',   label: '输血史',        group: '既往健康史', type: 'text' },
  { path: 'poisoningHistory',     label: '中毒史',        group: '既往健康史', type: 'text' },
  { path: 'infectiousHistory',    label: '传染病史',      group: '既往健康史', type: 'text' },
  { path: 'vaccinationHistory',   label: '预防接种史',    group: '既往健康史', type: 'text' },
  { path: 'otherDiseaseHistory',  label: '其他特殊疾病史', group: '既往健康史', type: 'text' },
  { path: 'healthProfile.drugAllergy',       label: '药物过敏',    group: '既往健康史', type: 'text' },
  { path: 'healthProfile.foodAllergy',       label: '食物过敏',    group: '既往健康史', type: 'text' },
  { path: 'healthProfile.pastHistory',       label: '既往史',      group: '既往健康史', type: 'text' },
  { path: 'healthProfile.medicHistory',      label: '用药史',      group: '既往健康史', type: 'text' },
  { path: 'healthProfile.surgeryHistory',    label: '手术史',      group: '既往健康史', type: 'text' },
  { path: 'healthProfile.menstrualHistory',  label: '月经史',      group: '既往健康史', type: 'text' },
  { path: 'healthProfile.maritalHistory',    label: '生育史',      group: '既往健康史', type: 'text' },
  { path: 'healthProfile.sexualHistory',     label: '性生活史',    group: '既往健康史', type: 'text' },
  { path: 'healthProfile.familyHistoryNote', label: '家族史',      group: '既往健康史', type: 'text' },
  { path: 'healthProfile.supplementHistory', label: '营养补剂史',  group: '既往健康史', type: 'text' },
  { path: 'healthProfile.recentMedication',  label: '近1月用药',   group: '既往健康史', type: 'text' },
  { path: 'healthProfile.recentSupplement',  label: '近1月补剂',   group: '既往健康史', type: 'text' },
  { path: 'healthProfile.recentSymptoms',    label: '近3月躯体症状', group: '既往健康史', type: 'array' },

  // 健康需求
  { path: 'healthConcern',       label: '本人关注健康问题', group: '健康需求', type: 'text' },
  { path: 'healthConcernFor',    label: '更关注谁的健康',   group: '健康需求', type: 'text' },
  { path: 'expectedService',     label: '期望的服务',       group: '健康需求', type: 'text' },
  { path: 'hasHomeMonitor',      label: '居家检测设备',     group: '健康需求', type: 'text' },
  { path: 'hasMedicineCabinet',  label: '居家小药箱',       group: '健康需求', type: 'text' },

  // 生活方式
  { path: 'lifestyle.diet',     label: '饮食',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.exercise', label: '运动',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.sleep',    label: '睡眠',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.water',    label: '饮水',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.alcohol',  label: '饮酒',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.smoking',  label: '吸烟',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.bowel',    label: '排便',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.mood',     label: '情绪',  group: '生活方式', type: 'text' },
];

const FIELD_MAP = Object.fromEntries(ARCHIVE_FIELDS.map(f => [f.path, f]));

// 按分组聚合，供前端下拉 optgroup 使用
function groupedArchiveFields() {
  const order = ['基本信息', '既往健康史', '健康需求', '生活方式'];
  const byGroup = {};
  ARCHIVE_FIELDS.forEach(f => { (byGroup[f.group] = byGroup[f.group] || []).push(f); });
  return order.filter(g => byGroup[g]).map(g => ({ group: g, fields: byGroup[g] }));
}

module.exports = { ARCHIVE_FIELDS, FIELD_MAP, groupedArchiveFields };
