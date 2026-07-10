// ── 健康档案字段清单（单一数据源）──────────────────────────────────────
// 用于：①问卷构建器给每题绑定「对应健康档案字段」②问卷答卷自动导入档案的归一化与写入。
// path 为写入 User 文档的字段路径（支持一层嵌套，如 healthProfile.pastHistory / lifestyle.diet）。
// type：text 文本 / array 数组(多选拼成数组) / enum 枚举 / date 日期 / number 数字。
// 与 staff PatientDetailPage 的 buildBasicInfoForm/buildHealthForm/buildHealthNeedsForm/buildLifestyleForm 对齐。

const ARCHIVE_FIELDS = [
  // 基本信息
  { path: 'gender',            label: '性别',         group: '基本信息', type: 'enum', options: ['男', '女', '未知'] },
  { path: 'birthDate',         label: '出生日期',     group: '基本信息', type: 'date' },
  { path: 'idType',            label: '证件类型',     group: '基本信息', type: 'enum', options: ['idCard', 'passport'] },
  { path: 'idNumber',          label: '身份证号/护照号', group: '基本信息', type: 'text' },
  { path: 'maritalStatus',     label: '婚姻状况',     group: '基本信息', type: 'text' },
  { path: 'ethnicity',         label: '民族',         group: '基本信息', type: 'text' },
  { path: 'workplace',         label: '所在企业',     group: '基本信息', type: 'text' },
  { path: 'occupation',        label: '所在行业',     group: '基本信息', type: 'text' },
  { path: 'education',         label: '学历',         group: '基本信息', type: 'text' },
  { path: 'hasAnnualCheckup',  label: '是否每年体检', group: '基本信息', type: 'text' },
  { path: 'height',            label: '身高',         group: '基本信息', type: 'number' },
  { path: 'weight',            label: '体重',         group: '基本信息', type: 'number' },
  { path: 'address',           label: '联系地址',     group: '基本信息', type: 'text' },
  { path: 'contactPhone',      label: '联系电话',     group: '基本信息', type: 'text' },
  { path: 'contactName',       label: '紧急联系人',   group: '基本信息', type: 'text' },
  { path: 'contactPhone2',     label: '紧急联系电话', group: '基本信息', type: 'text' },
  { path: 'deliveryAddress',   label: '快递配送地址', group: '基本信息', type: 'text' },
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

  // 医疗保障
  { path: 'basic_insurance',   label: '基础医疗保障', group: '医疗保障', type: 'enum', options: ['城镇医疗保险', '居民医疗保险', '自费'] },
  { path: 'commercial_medical',label: '商业医疗险',   group: '医疗保障', type: 'text' },
  { path: 'critical_illness',  label: '重疾险',       group: '医疗保障', type: 'enum', options: ['有', '无'] },

  // 生活方式
  { path: 'lifestyle.diet',     label: '饮食',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.exercise', label: '运动',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.sleep',    label: '睡眠',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.water',    label: '饮水',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.alcohol',  label: '饮酒',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.smoking',  label: '吸烟',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.bowel',    label: '排便',  group: '生活方式', type: 'text' },
  { path: 'lifestyle.mood',     label: '情绪',  group: '生活方式', type: 'text' },

  // 心理健康量表（问卷提交后自动计分写入，非逐题绑定，仅用于标签展示）
  { path: 'psychAssessments.epworth', label: 'Epworth嗜睡量表', group: '心理健康', type: 'text' },
  { path: 'psychAssessments.scl90',   label: 'SCL90症状自评',   group: '心理健康', type: 'text' },
  { path: 'psychAssessments.sds',     label: 'SDS抑郁自评',     group: '心理健康', type: 'text' },
  { path: 'psychAssessments.sas',     label: 'SAS焦虑自评',     group: '心理健康', type: 'text' },

  // 膳食调查（与 staff PatientDetailPage buildLifestyleForm 的 lifestyle_data 对齐）
  // 三餐与加餐
  { path: 'lifestyle_data.breakfastTime',        label: '早餐时间',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.breakfastDetail',      label: '早餐就餐方式',   group: '膳食调查', type: 'enum', options: ['居家', '外卖', '少吃', '不吃'] },
  { path: 'lifestyle_data.breakfastDesc',        label: '早餐品类描述',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.morningSnack',         label: '上午加餐',       group: '膳食调查', type: 'enum', options: ['是', '否'] },
  { path: 'lifestyle_data.morningSnackDesc',     label: '上午加餐品类',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.lunchTime',            label: '午餐时间',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.lunchDetail',          label: '午餐就餐方式',   group: '膳食调查', type: 'enum', options: ['居家', '饭店或外卖', '少吃', '不吃'] },
  { path: 'lifestyle_data.lunchDesc',            label: '午餐品类描述',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.afternoonSnack',       label: '下午加餐',       group: '膳食调查', type: 'enum', options: ['是', '否'] },
  { path: 'lifestyle_data.afternoonSnackDesc',   label: '下午加餐品类',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.dinnerTime',           label: '晚餐时间',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.dinnerDetail',         label: '晚餐就餐方式',   group: '膳食调查', type: 'enum', options: ['居家', '饭店或外卖', '少吃', '不吃'] },
  { path: 'lifestyle_data.dinnerDesc',           label: '晚餐品类描述',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.eveningSnack',         label: '晚间加餐',       group: '膳食调查', type: 'enum', options: ['是', '否'] },
  { path: 'lifestyle_data.eveningSnackDesc',     label: '晚间加餐品类',   group: '膳食调查', type: 'text' },
  // 食物摄入量
  { path: 'lifestyle_data.dailyStaple',      label: '每日主食摄入量', group: '膳食调查', type: 'enum', options: ['250克以内', '250-400克', '400克以上', '几乎不吃'] },
  { path: 'lifestyle_data.dailyVegetables',  label: '每日蔬菜摄入量', group: '膳食调查', type: 'enum', options: ['500克及以上', '300-500克', '300克以内', '几乎不吃'] },
  { path: 'lifestyle_data.dailyMeat',        label: '每日荤菜摄入量', group: '膳食调查', type: 'enum', options: ['80克以内', '80-150克', '150克及以上', '几乎不吃'] },
  { path: 'lifestyle_data.fruitFrequency',   label: '吃水果频次',     group: '膳食调查', type: 'enum', options: ['3天/周及以上', '每天吃', '几乎不吃'] },
  { path: 'lifestyle_data.fruitAmount',      label: '水果摄入量',     group: '膳食调查', type: 'enum', options: ['200克以内', '200-350克', '350克以上'] },
  { path: 'lifestyle_data.eggFrequency',     label: '鸡蛋摄入频次',   group: '膳食调查', type: 'enum', options: ['1-3天/周', '3-5天/周', '每天都吃'] },
  { path: 'lifestyle_data.eggAmount',        label: '鸡蛋摄入量',     group: '膳食调查', type: 'enum', options: ['1个', '2-3个', '4个以上'] },
  { path: 'lifestyle_data.dairyAmount',      label: '奶制品摄入量',   group: '膳食调查', type: 'enum', options: ['＜300毫升/天', '300-500毫升/天', '＞500毫升', '几乎不喝'] },
  { path: 'lifestyle_data.nutFrequency',     label: '坚果摄入频次',   group: '膳食调查', type: 'enum', options: ['一周2-3天', '每天吃', '几乎不吃'] },
  { path: 'lifestyle_data.nutAmount',        label: '坚果摄入量',     group: '膳食调查', type: 'enum', options: ['10克', '20-30克', '50克以上'] },
  { path: 'lifestyle_data.grainFrequency',   label: '粗杂粮摄入频次', group: '膳食调查', type: 'enum', options: ['每天吃', '1-2天/周', '3天/周及以上', '几乎不吃'] },
  { path: 'lifestyle_data.grainAmount',      label: '粗杂粮摄入量',   group: '膳食调查', type: 'enum', options: ['50-100克', '100-200克', '200-250克', '300克以上'] },
  // 饮食习惯
  { path: 'lifestyle_data.dietaryRestrictions',    label: '忌口',           group: '膳食调查', type: 'enum', options: ['无', '有'] },
  { path: 'lifestyle_data.dietaryRestrictionsDesc',label: '忌口具体说明',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.badDietHabits',          label: '不良饮食习惯',   group: '膳食调查', type: 'array' },
  { path: 'lifestyle_data.entertainment',          label: '应酬频率',       group: '膳食调查', type: 'enum', options: ['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔'] },
  // 运动与作息
  { path: 'lifestyle_data.exerciseType',       label: '运动类型',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.exerciseFrequency',  label: '运动频率',       group: '膳食调查', type: 'enum', options: ['1-2天/周', '3-5天/周', '6-7天/周', '无'] },
  { path: 'lifestyle_data.exerciseDuration',   label: '每次运动时长（分钟）', group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.wakeTime',           label: '起床时间',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.sleepTime',          label: '入睡时间',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.scheduleRegularity', label: '作息规律性',     group: '膳食调查', type: 'enum', options: ['规律', '不规律'] },
  { path: 'lifestyle_data.exerciseRemark',     label: '运动备注',       group: '膳食调查', type: 'text' },
  // 烟酒与应酬
  { path: 'lifestyle_data.smokingStatus',     label: '吸烟情况',   group: '膳食调查', type: 'enum', options: ['＜10支/日', '10-20支/日', '20-30支/日', '30支以上/日', '不吸烟', '戒烟'] },
  { path: 'lifestyle_data.drinkingFrequency', label: '饮酒频率',   group: '膳食调查', type: 'enum', options: ['＜1天/周', '1-3天/周', '3天/周及以上', '每天喝', '不喝酒'] },
  { path: 'lifestyle_data.drinkingType',      label: '饮酒类型',   group: '膳食调查', type: 'array' },
  { path: 'lifestyle_data.drinkingAmount',    label: '饮酒量',     group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.entertainmentFreq',label: '应酬频率（烟酒板块）', group: '膳食调查', type: 'enum', options: ['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔'] },
  // 营养素与过敏
  { path: 'lifestyle_data.nutritionHistory',     label: '营养干预史',       group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.dailyDietAssessment',  label: '每日膳食摄入量评估', group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.nutrientOverview',     label: '营养素摄入概况',   group: '膳食调查', type: 'text' },
  { path: 'lifestyle_data.foodAllergens',        label: '食物过敏源',       group: '膳食调查', type: 'array' },
  { path: 'lifestyle_data.glutenAllergy',        label: '麸质过敏',         group: '膳食调查', type: 'enum', options: ['是', '否', '不详'] },
  { path: 'lifestyle_data.dailyWater',           label: '每日饮水量',       group: '膳食调查', type: 'enum', options: ['1500毫升内', '1500-1700毫升', '1800-2000毫升', '2500毫升', '3000毫升以上'] },
  { path: 'lifestyle_data.psychStress',          label: '心理压力',         group: '膳食调查', type: 'enum', options: ['正常', '中等压力/焦虑', '严重抑郁/焦虑'] },
  { path: 'lifestyle_data.bowelRegularity',      label: '排便规律性',       group: '膳食调查', type: 'enum', options: ['规律（1-2次/日）', '偶尔不规律', '便秘/腹泻'] },
  { path: 'lifestyle_data.bowelShape',           label: '大便形状',         group: '膳食调查', type: 'text' },
];

const FIELD_MAP = Object.fromEntries(ARCHIVE_FIELDS.map(f => [f.path, f]));

// 按分组聚合，供前端下拉 optgroup 使用
function groupedArchiveFields() {
  const order = ['基本信息', '既往健康史', '健康需求', '医疗保障', '生活方式', '心理健康', '膳食调查'];
  const byGroup = {};
  ARCHIVE_FIELDS.forEach(f => { (byGroup[f.group] = byGroup[f.group] || []).push(f); });
  return order.filter(g => byGroup[g]).map(g => ({ group: g, fields: byGroup[g] }));
}

module.exports = { ARCHIVE_FIELDS, FIELD_MAP, groupedArchiveFields };
