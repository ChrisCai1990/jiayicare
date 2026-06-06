const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone:    { type: String, required: true, unique: true },
  wechatOpenid: { type: String, sparse: true, unique: true },
  name:     { type: String, default: '用户' },
  age:      { type: Number },
  gender:   { type: String, enum: ['男', '女', '未知'], default: '未知' },
  avatar:   { type: String },
  healthScore: { type: Number, default: 0 },
  servicePackage: { type: String, default: '' },
  serviceExpiry:  { type: String, default: '' },
  doctor:  {
    name:  { type: String, default: '' },
    title: { type: String, default: '' },
  },
  manager: {
    name:  { type: String, default: '' },
    title: { type: String, default: '' },
  },
  height:   { type: Number },
  weight:   { type: Number },
  smoking:  { type: String, default: '' },
  drinking: { type: String, default: '' },
  exercise: { type: String, default: '' },
  onboardingCompleted: { type: Boolean, default: false },
  // 健康评分历史（每日打点，保留最近 30 条）
  scoreHistory: [{
    score: { type: Number },
    date:  { type: String },   // YYYY-MM-DD
  }],
  healthProfile: {
    bloodType:     { type: String, default: '' },
    // 结构化多行字段（Mixed 类型，保持灵活性）
    allergies:     { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{substance:'青霉素', type:'药物', reaction:'荨麻疹'}]
    medicalHistory:{ type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{disease:'高血压', onsetDate:'2020', hospital:'XX医院', treatment:'服药控制'}]
    medications:   { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{chemicalName:'', brandName:'', dose:'', route:'', frequency:'', duration:'', sideEffects:''}]
    familyHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{disease:'糖尿病', relative:'父亲', diagnosisDate:'2015', treatment:'胰岛素'}]
    surgeries:     { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{name:'阑尾切除', date:'2018', hospital:'XX医院', outcome:'良好'}]
    // 兼容旧字段（文本形式，保留不删）
    drugAllergy:   { type: String, default: '' },
    foodAllergy:   { type: String, default: '' },
    pastHistory:   { type: String, default: '' },
    medicHistory:  { type: String, default: '' },
    surgeryHistory:{ type: String, default: '' },
    // 女性专属
    menstrualHistory:   { type: String, default: '' },
    reproductiveHistory:{ type: String, default: '' }, // 旧字段，兼容保留
    maritalHistory:     { type: String, default: '' }, // 新字段：婚育史（替代 reproductiveHistory）
    familyHistoryNote:  { type: String, default: '' }, // 医护端录入的家族史文字备注
  },
  // 联系信息（#34）
  contactPhone:    { type: String, default: '' },  // 联系电话（与登录手机号独立）
  deliveryAddress: { type: String, default: '' },  // 配送地址（快递用）
  // 患者类型（成人/儿童）
  patientCategory: { type: String, enum: ['adult', 'child'], default: 'adult' },
  birthDate: { type: String, default: '' }, // YYYY-MM-DD

  // ── 成人完整健康档案扩展字段 ──────────────────────────────────────
  // 联系信息扩展
  address:        { type: String, default: '' },  // 联系地址
  contactName:    { type: String, default: '' },  // 联系人姓名
  contactPhone3:  { type: String, default: '' },  // 联系人电话
  // 血型
  bloodTypeABO:   { type: String, enum: ['A', 'B', 'O', 'AB', ''], default: '' },
  bloodTypeRH:    { type: String, enum: ['阳性', '阴性', ''], default: '' },
  // 既往史（结构化）
  traumaHistory:     { type: String, default: '' }, // 外伤史
  transfusionHistory:{ type: String, default: '' }, // 输血史
  infectiousHistory: { type: String, default: '' }, // 传染病史
  vaccinationHistory:{ type: String, default: '' }, // 预防接种史
  // 信仰
  belief:          { type: String, default: '' },   // 宗教信仰
  memberType:      { type: String, default: '' },   // 会员类型

  // ── 儿童专属档案 ──────────────────────────────────────────────────
  childProfile: {
    // 围产情况
    motherAge:        { type: Number },
    gravida:          { type: Number }, // 胎次
    para:             { type: Number }, // 产次
    motherPregnancyStatus: { type: String, default: '' }, // 母亲妊娠期健康状况
    deliveryComplications: { type: String, default: '' }, // 产时并发症
    // 出生情况
    gestationalWeeks: { type: Number }, // 出生孕周
    birthWeight:      { type: Number }, // 出生体重(g)
    birthLength:      { type: Number }, // 出生身长(cm)
    birthHeadCirc:    { type: Number }, // 出生头围(cm)
    birthChestCirc:   { type: Number }, // 出生胸围(cm)
    deliveryMode:     { type: String, default: '' }, // 分娩方式
    apgar1min:        { type: Number }, // Apgar 1分钟
    apgar5min:        { type: Number }, // Apgar 5分钟
    // 生后情况
    neonatalConditions:  { type: String, default: '' }, // 新生儿期患病
    birthDefects:        { type: String, default: '' }, // 出生缺陷
    hearingScreening:    { type: String, enum: ['通过', '未通过', '未查', ''], default: '' },
    eyeScreening:        { type: String, default: '' },
    visionScreening:     { type: String, default: '' },
    neonatalDiseaseScreen:{ type: String, default: '' },
    // 遗传背景
    fatherHeight:     { type: Number },
    motherHeight:     { type: Number },
    fatherBirthDate:  { type: String, default: '' },
    motherBirthDate:  { type: String, default: '' },
    familyAllergyHistory: { type: String, default: '' },
  },

  // 医护端管理字段
  assignedHealthManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 健管专员
  assignedFamilyDoctor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 家庭医生
  assignedNutritionist:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 营养师
  chronicDiseases: { type: [String], default: [] }, // 慢病标签，如 ['高血压','糖尿病']
  idNumber:        { type: String, default: '' },   // 身份证号
  source:          { type: String, default: '' },   // 患者来源
  patientType:     { type: String, enum: ['regular', 'vip', 'trial', ''], default: '' }, // 患者类型
  remark:          { type: String, default: '' },   // 备注
  workplace:       { type: String, default: '' },   // 工作单位
  occupation:      { type: String, default: '' },   // 职业
  maritalStatus:   { type: String, default: '' },   // 婚姻状况
  ethnicity:       { type: String, default: '' },   // 民族
  contactPhone2:   { type: String, default: '' },   // 紧急联系电话
  // 生活方式（文字描述，旧字段保留兼容）
  lifestyle: {
    diet:     { type: String, default: '' },
    exercise: { type: String, default: '' },
    sleep:    { type: String, default: '' },
    water:    { type: String, default: '' },
    alcohol:  { type: String, default: '' },
    smoking:  { type: String, default: '' },
    bowel:    { type: String, default: '' },
    mood:     { type: String, default: '' },
  },
  // 生活方式详细结构化数据（膳食调查表融合后新字段）
  lifestyle_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  serviceStartDate: { type: String, default: '' }, // 服务开始时间

  // ── 健康评分相关 ─────────────────────────────────────────────────
  // 慢病严重度: { '高血压': 1, '糖尿病': 2, ... }  1=轻/早 2=中 3=重
  chronicDiseaseSeverity: { type: mongoose.Schema.Types.Mixed, default: {} },
  // 体检关键指标（最近一次）: fpg,tc,ldl,tg,ua,alt,ckdStage,sbp,dbp,labDate
  labValues: { type: mongoose.Schema.Types.Mixed, default: {} },
  // 评分明细（最近一次计算结果）
  healthScoreDetail: { type: mongoose.Schema.Types.Mixed, default: {} },
  // 奖励加分（连续打卡等行为激励）
  healthScoreBonus: { type: Number, default: 0 },

  // 健康基金余额（由医护端 $inc 累加，Mongoose 必须显式定义才能读取）
  healthFundBalance: { type: Number, default: 0 },

  // ── 医疗保障信息（需求15）───────────────────────────────────────
  basic_insurance:   { type: String, default: '' }, // 基础医疗保障：城镇医疗保险/居民医疗保险/自费
  commercial_medical:{ type: String, default: '' }, // 商业医疗险（多选逗号分隔）：高端医疗险,百万医疗险
  critical_illness:  { type: String, default: '' }, // 重疾险：有/无

  // ── 会员运营字段 ─────────────────────────────────────────────────
  cardNumber: { type: String, default: '' },   // 会员卡号
  points:     { type: Number, default: 0 },    // 积分
  rechargeBalance: { type: Number, default: 0 }, // 充值余额（元）

  // ── 共享人账户（家庭成员，旧版） ─────────────────────────────────
  family: [{
    name:     { type: String, default: '' },
    relation: { type: String, default: '' },
    phone:    { type: String, default: '' },
    birthday: { type: String, default: '' },
    gender:   { type: String, default: '' },
    notes:    { type: String, default: '' },
  }],
  // ── 系统内家庭成员关联（需求18）───────────────────────────────────
  familyLinks: [{
    linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    relation:   { type: String, default: '' },
    createdAt:  { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
