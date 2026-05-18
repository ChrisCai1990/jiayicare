const HealthRecord = require('../models/HealthRecord');
const Medication = require('../models/Medication');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Reminder = require('../models/Reminder');
const User = require('../models/User');

// 新用户注册后自动填充演示数据
async function seedUserData(userId) {
  // 血压近16条趋势数据
  const bpDates = ['4/16','4/18','4/20','4/22','4/24','4/26','4/28','4/30','5/1','5/3','5/5','5/7','5/9','5/11','5/13','5/15'];
  const bpSys   = [152,149,150,147,145,143,146,144,148,145,142,138,140,136,134,132];
  const bpDia   = [95,93,94,91,90,89,91,89,92,90,88,86,87,85,84,82];
  for (let i = 0; i < bpDates.length; i++) {
    const daysAgo = bpDates.length - 1 - i;
    await HealthRecord.create({
      user: userId, category: '生命体征', type: 'bloodPressure',
      label: '血压', value: `${bpSys[i]}/${bpDia[i]}`, unit: 'mmHg',
      extra: { sys: bpSys[i], dia: bpDia[i] },
      status: bpSys[i] >= 140 ? 'danger' : bpSys[i] >= 130 ? 'warning' : 'normal',
      recordedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    });
  }

  // 血糖数据
  const bsDates = [30,27,24,21,18,15,12,9,6,4,2,0];
  const bsVals  = [7.8,7.5,7.3,7.1,6.9,7.2,6.8,7.0,6.5,6.3,6.1,6.1];
  for (let i = 0; i < bsDates.length; i++) {
    await HealthRecord.create({
      user: userId, category: '生命体征', type: 'bloodSugar',
      label: '空腹血糖', value: String(bsVals[i]), unit: 'mmol/L',
      status: bsVals[i] >= 7.0 ? 'danger' : bsVals[i] >= 6.1 ? 'warning' : 'normal',
      recordedAt: new Date(Date.now() - bsDates[i] * 24 * 60 * 60 * 1000),
    });
  }

  // 用药
  await Medication.create([
    { user: userId, name: '苯磺酸氨氯地平', dosage: '5mg', frequency: '每日1次', timing: '早餐后', startDate: '2025-01-01' },
    { user: userId, name: '阿托伐他汀钙',   dosage: '20mg', frequency: '每日1次', timing: '睡前',   startDate: '2025-01-01' },
  ]);

  // 任务
  await Task.create([
    { user: userId, title: '血压记录', description: '早晨空腹测量血压并记录', priority: 'high', status: 'pending', dueDate: '今日', dueTime: '09:00', assignee: '王健管', type: 'record', category: '健康记录' },
    { user: userId, title: '本月随访', description: '张医生月度健康评估电话随访', priority: 'high', status: 'pending', dueDate: '今日', dueTime: '14:00', assignee: '张医生', type: 'followup', category: '随访复诊' },
    { user: userId, title: '填写健康问卷', description: '5月月度自评量表（情绪、睡眠、运动）', priority: 'medium', status: 'pending', dueDate: '明日', dueTime: '23:59', assignee: '本人填写', type: 'questionnaire', category: '自我管理' },
    { user: userId, title: '复查血脂四项', description: '空腹到附近医院检查血脂，上传报告', priority: 'medium', status: 'pending', dueDate: '5月20日', dueTime: '前完成', assignee: '王健管跟进', type: 'checkup', category: '随访复诊' },
    { user: userId, title: '营养咨询', description: '与营养师确认低盐低脂饮食方案调整', priority: 'low', status: 'completed', dueDate: '5月14日', dueTime: '已完成', assignee: '营养师赵', type: 'consultation', category: '专项咨询' },
  ]);

  // 消息
  await Message.create([
    { user: userId, type: 'doctor',  sender: '张医生',  content: '李明您好，您近期血压整体有所改善，请继续保持低盐饮食，睡眠时间建议增加到7小时以上。', unread: true },
    { user: userId, type: 'system',  sender: '系统通知', content: '您的5月血压记录已完成7次，本月目标达成率88%，继续加油！', unread: true },
    { user: userId, type: 'manager', sender: '王健管',  content: '您好，提醒您今天下午2点张医生会进行月度随访，请注意接听电话。', unread: false },
    { user: userId, type: 'system',  sender: '服务提醒', content: '您的"心脑血管健康管理年度服务包"距到期还有305天，续约享9折优惠。', unread: false },
  ]);

  // 提醒
  await Reminder.create([
    { user: userId, type: 'medication',  title: '苯磺酸氨氯地平', description: '每日早餐后服用 1片（5mg）',  time: '08:00', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], enabled: true, icon: 'medkit', streak: 12 },
    { user: userId, type: 'medication',  title: '阿托伐他汀钙',   description: '每晚睡前服用 1片（20mg）', time: '21:30', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], enabled: true, icon: 'medkit', streak: 8  },
    { user: userId, type: 'measurement', title: '早间血压测量',   description: '起床后静坐5分钟再测量',   time: '07:30', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], enabled: true, icon: 'heart',  streak: 7  },
    { user: userId, type: 'exercise',    title: '晚间散步',       description: '饭后30分钟慢走30分钟',    time: '19:30', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], enabled: true, icon: 'walk',   streak: 5  },
  ]);

  // 更新演示用户基础信息
  await User.findByIdAndUpdate(userId, {
    name: '李明',
    age: 58,
    gender: '男',
    height: 172,
    weight: 75,
    healthScore: 75,
    onboardingCompleted: true,
    servicePackage: '心脑血管健康管理年度服务包',
    serviceExpiry: '2026-12-31',
    doctor:  { name: '张建国', title: '心内科主任医师' },
    manager: { name: '王丽',   title: '高级健康管家' },
    healthProfile: {
      bloodType:     'A 型 Rh+',
      drugAllergy:   '青霉素类',
      foodAllergy:   '无',
      pastHistory:   '高血压(2020年)',
      medicHistory:  '苯磺酸氨氯地平、阿托伐他汀钙',
      familyHistory: '父亲：高血压、冠心病',
      surgeryHistory:'无',
    },
  });

  console.log(`✅ 用户 ${userId} 演示数据初始化完成`);
}

module.exports = { seedUserData };
