function reportYearForAnalysis(report) {
  const date = String(report.checkDate || report.date || '').slice(0, 10);
  return Number(date.slice(0, 4) || report.reportYear);
}

function reportsInAnalysisWindow(reports, targetYear) {
  return reports.filter(report => {
    const year = reportYearForAnalysis(report);
    return Number.isInteger(year) && year >= targetYear - 4 && year <= targetYear;
  });
}

module.exports = { reportYearForAnalysis, reportsInAnalysisWindow };
