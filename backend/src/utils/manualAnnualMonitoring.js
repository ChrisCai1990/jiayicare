const { monitoringCycleDays } = require('./monitoringCycle');

const METRIC_LABELS = { bloodPressure: '血压', bloodSugar: '血糖', waist: '腰围', heartRate: '心率',
  weight: '体重', sleep: '睡眠', mood: '情绪', diet: '饮食', exercise: '运动', water: '饮水',
  bowel: '排便', smoking: '吸烟', alcohol: '饮酒' };

function manualMonitoringItems(moduleData) {
  const source = moduleData?.monitoring?.enabled === false ? [] : moduleData?.monitoring?.records || [];
  const rows = source.map(row => ({ type: row.metricType || Object.keys(METRIC_LABELS).find(type => METRIC_LABELS[type] === row.items),
    frequency: String(row.frequency || '').trim(), period: String(row.measurementPeriod || '').trim() }));
  if (!rows.length || rows.length > Object.keys(METRIC_LABELS).length || rows.some(row => !METRIC_LABELS[row.type]
    || !monitoringCycleDays(row.frequency)) || new Set(rows.map(row => row.type)).size !== rows.length) {
    const error = new Error('请先为年度方案中的每个监测项目确认周期，并核对重复项目');
    error.statusCode = 400;
    throw error;
  }
  return rows.map(row => ({ ...row, label: METRIC_LABELS[row.type] }));
}

module.exports = { METRIC_LABELS, manualMonitoringItems };
