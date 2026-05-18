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
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
