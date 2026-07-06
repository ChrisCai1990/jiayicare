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
  onboardingCompletedAt: { type: Date, default: null }, // 完成首次登录建档的时间，用于分批推送问卷计时
  onboardingBatch2PushedAt: { type: Date, default: null }, // 第二批问卷(生活方式+心理健康)已推送时间，避免重复推送
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
    maritalHistory:     { type: String, default: '' }, // 生育史（孕产次、分娩方式等）
    sexualHistory:      { type: String, default: '' }, // 是否有性生活史
    familyHistoryNote:  { type: String, default: '' }, // 医护端录入的家族史文字备注
    supplementHistory:  { type: String, default: '' }, // 是否有长期服用营养补剂
    // 其他健康信息（近期状态）
    recentSymptoms:     { type: [String], default: [] }, // 最近3个月躯体症状（多选）
    recentMedication:   { type: String, default: '' },   // 最近1个月是否服用中药或西药
    recentSupplement:   { type: String, default: '' },   // 最近1个月是否服用营养补剂
  },
  // 健康需求
  healthConcern:       { type: String, default: '' }, // 本人比较关注的健康问题
  healthConcernFor:    { type: String, default: '' }, // 更关注谁的健康问题
  expectedService:     { type: String, default: '' }, // 期望得到怎样的家庭医师服务
  hasHomeMonitor:      { type: String, default: '' }, // 是否配备居家检测设备
  hasMedicineCabinet:  { type: String, default: '' }, // 是否配备居家小药箱
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
  poisoningHistory:  { type: String, default: '' }, // 中毒史
  infectiousHistory: { type: String, default: '' }, // 传染病史
  otherDiseaseHistory:{ type: String, default: '' },// 其他特殊疾病史
  vaccinationHistory:{ type: String, default: '' }, // 预防接种史
  // 信仰
  belief:          { type: String, default: '' },   // 宗教信仰
  memberType:      { type: String, default: '' },   // 会员类型
  enterpriseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', default: null }, // 所属企业客户（B2B2C）
  isRegisteredClient: { type: Boolean, default: false }, // 系统正式录入客户，由医护/超管设置

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
  assignedHealthManager:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 健管专员
  assignedFamilyDoctor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 家庭医师
  assignedNutritionist:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 营养师
  assignedSpecialist:       { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 专科医师
  assignedTcmDoctor:        { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 中医师
  assignedPsychologist:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 心理咨询师
  assignedRehabSpecialist:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 运动复健师
  assignedMedicalAssistant: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 就医专员
  chronicDiseases: { type: [String], default: [] }, // 慢病标签，如 ['高血压','糖尿病']
  idNumber:        { type: String, default: '' },   // 身份证号
  source:          { type: String, default: '' },   // 患者来源
  patientType:     { type: String, enum: ['regular', 'vip', 'trial', ''], default: '' }, // 患者类型
  remark:          { type: String, default: '' },   // 备注
  workplace:       { type: String, default: '' },   // 所在企业
  occupation:      { type: String, default: '' },   // 所在行业
  education:       { type: String, default: '' },   // 学历
  hasAnnualCheckup:{ type: String, default: '' },   // 是否每年有健康体检的习惯
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
  // 问卷自动导入健康档案的待审核草稿（{generatedAt,questionnaireId,responseId,status,items[]}）
  archiveDraft: { type: mongoose.Schema.Types.Mixed, default: null },
  // 问卷无冲突自动写入档案的留痕日志（最近20条，供家庭医生查看系统自动做了什么改动）
  // [{ questionnaireTitle, appliedAt, items: [{path,label,valueStr}] }]
  archiveAutoLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // 心理健康量表最新结果（问卷推送→患者填写→自动写入，无需审核）
  // { epworth: {totalScore,severity,filledAt,questionnaireId}, scl90: {totalScore,factorScores:{躯体化:2.1,...},filledAt,questionnaireId}, sds:{...}, sas:{...} }
  psychAssessments: { type: mongoose.Schema.Types.Mixed, default: {} },
  // 10年ASCVD风险评估（医护端录入体检参数→按中国指南自动分层，展示在心理评估下方）
  // { level, levelLabel, description, riskFactors:[], directHighRisk, advice, inputs:{...}, evaluatedBy, evaluatedAt }
  ascvdRisk: { type: mongoose.Schema.Types.Mixed, default: null },
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
  // ── 待确认的家庭成员邀请（需求6）──────────────────────────────────
  familyInvites: [{
    fromUser:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromName:  { type: String, default: '' },
    relation:  { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    status:    { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  }],

  // ── 档案审核（3.1）──────────────────────────────────────────────────
  archiveReviewStatus: { type: String, enum: ['pending', 'reviewed'], default: 'pending' },
  archiveReviewedAt:   { type: Date, default: null },
  archiveReviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

  // ── 身体成分（4.2）──────────────────────────────────────────────────
  bodyComposition: { type: mongoose.Schema.Types.Mixed, default: {} },
  bodyCompHistory: { type: [mongoose.Schema.Types.Mixed], default: [] }, // 历史记录 [{...fields, recordedAt}]
  labHistory:      { type: [mongoose.Schema.Types.Mixed], default: [] }, // 体检指标历史 [{...fields, recordedAt}]

  // ── AI健康汇总分析（4.4）───────────────────────────────────────────
  aiHealthSummary: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── AI风险评估与预警（场景八）─────────────────────────────────────
  // { dimensions:[{key,label,level,score,factors:[],advice}], overallLevel, generatedAt, approvedAt, approvedBy, alerted }
  aiRiskAssessment: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── AI随访建议草稿（场景12：健管专员审核后采纳）──────────────────────
  // { timing, timingReason, suggestedDate, theme, outline[], generatedAt, generatedBy, status, approvedAt, approvedBy }
  aiFollowupDraft: { type: mongoose.Schema.Types.Mixed, default: null },

  // ── AI教练消息草稿（场景13：营养师审核后发送）────────────────────────
  // { message, adherence, streak, daysSinceLast, tone, generatedAt, generatedBy, status, approvedAt, approvedBy }
  aiCoachDraft: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

// ── 索引：医护端会员列表按分配医护过滤 + 按创建时间排序，慢病筛选 ──
// 常用路径：healthManager 角色 { assignedHealthManager } + sort(createdAt)
userSchema.index({ assignedHealthManager: 1, createdAt: -1 });
userSchema.index({ assignedFamilyDoctor: 1, createdAt: -1 });
userSchema.index({ assignedNutritionist: 1, createdAt: -1 });
userSchema.index({ assignedSpecialist: 1, createdAt: -1 });
userSchema.index({ assignedTcmDoctor: 1, createdAt: -1 });
userSchema.index({ assignedPsychologist: 1, createdAt: -1 });
userSchema.index({ assignedRehabSpecialist: 1, createdAt: -1 });
userSchema.index({ assignedMedicalAssistant: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });        // 超管看全部时的排序
userSchema.index({ chronicDiseases: 1 });   // 慢病筛选

module.exports = mongoose.model('User', userSchema);
