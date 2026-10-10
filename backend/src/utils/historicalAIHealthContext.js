function reportYear(report) {
  return Number(report.reportYear || String(report.checkDate || report.date || '').slice(0, 4));
}

function reportsThroughYear(reports, year) {
  return reports.filter(report => {
    const value = reportYear(report);
    return Number.isInteger(value) && value >= 1900 && value <= year;
  });
}

function historicalUserSnapshot(user, year) {
  const original = typeof user.toObject === 'function' ? user.toObject() : user;
  const birthYear = Number(String(original.birthDate || '').slice(0, 4));
  return {
    _id: original._id, name: original.name, gender: original.gender,
    age: birthYear >= 1900 && birthYear <= year ? year - birthYear : null,
    healthProfile: {}, lifestyle: {}, lifestyle_data: {}, psychAssessments: {},
    labValues: {}, bodyComposition: {}, chronicDiseases: [], healthConcern: '',
  };
}

module.exports = { reportYear, reportsThroughYear, historicalUserSnapshot };
