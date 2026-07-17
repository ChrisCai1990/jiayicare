// 健康打卡记录状态判断，用户端(healthRecords.js)和医护端(staff.js)编辑记录时共用，避免逻辑分叉
function calcStatus(type, value, extra) {
  const v = parseFloat(value);
  if (type === 'bloodPressure') {
    const sys = extra?.sys ? parseFloat(extra.sys) : v;
    if (sys >= 140) return 'danger';
    if (sys >= 130) return 'warning';
    return 'normal';
  }
  if (type === 'bloodSugar') {
    if (v >= 7.0) return 'danger';
    if (v >= 6.1) return 'warning';
    if (v < 3.9)  return 'danger';   // 低血糖（< 3.9 mmol/L）危及生命，等级应为 danger
    return 'normal';
  }
  if (type === 'heartRate') {
    if (v > 100 || v < 60) return 'warning';
    return 'normal';
  }
  if (type === 'sleep') {
    if (v < 6) return 'warning';
    return 'normal';
  }
  return 'normal';
}

module.exports = { calcStatus };
