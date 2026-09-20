function sendReportWriteConflict(res) {
  return res.status(409).json({ success: false, code: 'REPORT_WRITE_CONFLICT',
    message: '报告正在回写检查项目或生成复查任务，或已发生并发变更。本次修改未保存，请刷新后重试；若持续占用，请联系管理员核查。' });
}
module.exports = { sendReportWriteConflict };
