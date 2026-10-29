const dateKey = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

function makeCheckupScheduleRevision(plan, year, checkupDate, staff, at = new Date()) {
  const fromYear = Number(plan.year);
  const toYear = Number(year);
  const fromDate = dateKey(plan.checkupDate);
  const toDate = dateKey(checkupDate);
  if (fromYear === toYear && fromDate === toDate) return null;
  return {
    at, by: staff._id, byName: staff.name || '',
    fromYear, toYear,
    fromCheckupDate: fromDate || null, toCheckupDate: toDate || null,
  };
}

module.exports = { makeCheckupScheduleRevision };
