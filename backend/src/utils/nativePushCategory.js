const categories = ['medication', 'measurement', 'exercise', 'doctor', 'manager', 'nutritionist', 'report', 'system', 'service_exp'];
function category(message) {
  if (categories.includes(message?.pushCategory)) return message.pushCategory;
  if (message?.type === 'doctor') return 'doctor';
  if (['manager', 'planner', 'medicalAssistant'].includes(message?.type)) return 'manager';
  if (message?.type === 'nutritionist') return 'nutritionist';
  const title = String(message?.title || '');
  if (/用药|服药|配药/.test(title)) return 'medication';
  if (/血压|血糖|测量|监测|体重/.test(title)) return 'measurement';
  if (/运动|训练/.test(title)) return 'exercise';
  if (/报告/.test(title)) return 'report';
  if (/到期|续约/.test(title)) return 'service_exp';
  return 'system';
}
module.exports = { categories, category };
