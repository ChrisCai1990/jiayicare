const mongoose = require('mongoose');

// 11 个提醒类别
const CATEGORIES = [
  'followup_abnormal',  // 异常复查提醒
  'medication',          // 用药提醒
  'supplement',          // 营养素补充提醒
  'monitoring',          // 日常监测提醒
  'screening_annual',    // 年度筛查提醒
  'vaccination',         // 疫苗接种提醒
  'diet_checkin',        // 饮食打卡提醒
  'exercise_checkin',    // 运动打卡提醒
  'weight_checkin',      // 体重打卡提醒
  'sleep',               // 入睡提醒
  'substance',           // 烟酒提醒
];

const reminderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category:    { type: String, enum: CATEGORIES, required: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  enabled:     { type: Boolean, default: true },

  // ── 调度类型 ──────────────────────────────────────────────────
  // 'once'      → 单次日期（复查/筛查/疫苗）
  // 'recurring' → 重复（用药/营养素/监测/打卡类）
  scheduleType: { type: String, enum: ['once', 'recurring'], required: true },

  // once：目标日期
  targetDate: { type: Date },

  // recurring：提醒时间 + 重复规则
  reminderTime:       { type: String, default: '08:00' },  // HH:mm
  daysOfWeek:         [{ type: String }],                   // [] = 每天，['Mon','Wed',...] = 指定星期
  customEveryNDays:   { type: Number },                     // 每 N 天一次（与 daysOfWeek 互斥）
  startDate:          { type: Date },                        // 开始日期（可选）
  endDate:            { type: Date },                        // 结束日期（可选，null=长期）

  streak: { type: Number, default: 0 },
}, { timestamps: true });

reminderSchema.index({ user: 1, enabled: 1 });
reminderSchema.index({ user: 1, category: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
module.exports.CATEGORIES = CATEGORIES;
