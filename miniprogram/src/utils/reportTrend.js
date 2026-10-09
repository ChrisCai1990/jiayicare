function recordsWithinDays(records, days, now = Date.now()) {
  const cutoff = now - days * 86400000;
  return (records || []).filter(record => new Date(record.recordedAt).getTime() >= cutoff).slice(-12);
}

module.exports = { recordsWithinDays };
