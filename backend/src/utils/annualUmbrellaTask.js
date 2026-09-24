// 年度方案本身不是一项可执行随访。仅识别系统生成的年度统筹占位，
// 具体就医、检查、复查及人工创建的协同任务仍应正常派发。
const UMBRELLA_TITLE = /^(?:协同执行\s*[·・]\s*)?统筹\d{4}年度健康管理方案协同任务$/;

const isAnnualUmbrellaRecord = (record) => [record?.items, record?.standardPlanName]
  .some(value => UMBRELLA_TITLE.test(String(value || '').trim()));

const obsoleteAnnualUmbrellaQuery = {
  $or: [
    { sourceType: 'annual_coordination' },
    {
      sourceType: 'scheduled',
      sourceAnnualPlanId: { $exists: true, $ne: null },
      theme: UMBRELLA_TITLE,
    },
  ],
};

module.exports = { isAnnualUmbrellaRecord, obsoleteAnnualUmbrellaQuery };
