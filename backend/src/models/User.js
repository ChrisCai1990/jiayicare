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
  // 生活方式（文字描述）
  lifestyle: {
    diet:     { type: String, default: '' },  // 饮食
    exercise: { type: String, default: '' },  // 运动
    sleep:    { type: String, default: '' },  // 睡眠
    water:    { type: String, default: '' },  // 饮水
    alcohol:  { type: String, default: '' },  // 饮酒
    smoking:  { type: String, default: '' },  // 吸烟
    bowel:    { type: String, default: '' },  // 排便
    mood:     { type: String, default: '' },  // 情绪
  },
  serviceStartDate: { type: String, default: '' }, // 服务开始时间

  // 健康基金余额（由医护端 $inc 累加，Mongoose 必须显式定义才能读取）
  healthFundBalance: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
