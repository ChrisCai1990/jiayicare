const FREQUENCY_DAYS = { '每日1次': 1, '每周1次': 7 };

function monitoringCycleDays(frequency) {
  if (frequency === '每周2次') return 'twice_weekly';
  if (FREQUENCY_DAYS[frequency]) return FREQUENCY_DAYS[frequency];
  const match = String(frequency || '').match(/^每([1-9]\d{0,2})天1次$/);
  return match && Number(match[1]) <= 365 ? Number(match[1]) : null;
}

function nextMonitoringDate(completedAt, frequency) {
  const days = monitoringCycleDays(frequency);
  if (!days) throw new Error('监测周期无效');
  const chinaDay = new Date(new Date(completedAt).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const next = new Date(`${chinaDay}T00:00:00.000Z`);
  if (days === 'twice_weekly') {
    do { next.setUTCDate(next.getUTCDate() + 1); }
    while (![1, 4].includes(next.getUTCDay())); // Monday and Thursday
  } else next.setUTCDate(next.getUTCDate() + days);
  return next;
}

module.exports = { monitoringCycleDays, nextMonitoringDate };
