const text = value => String(value || '').trim();

function isZheyiReport(report) {
  const haystack = [report?.title, report?.institution, report?.hospital].map(text).join(' ');
  return /浙一|浙江大学医学院附属第一医院|浙江大学医学院附属一院/.test(haystack);
}

function pageMode(pageNum) {
  if (pageNum >= 1 && pageNum <= 5) return 'skip';
  if (pageNum >= 6 && pageNum <= 16) return 'extract';
  return 'duplicate';
}

const PAGE_SECTIONS = {
  6: '一般检查、眼科检查、耳鼻喉科检查',
  7: '耳鼻喉科续页、口腔科检查、内科检查、外科检查',
  8: '外科续页、眼压、人体成分、糖尿病筛查、肝脏弹性B超、肺通气功能',
  9: '肺部CT、双肾输尿管超声、肝胆脾胰超声',
  10: '甲状腺、颈动脉、膀胱前列腺、心脏超声',
  11: '心电图、骨密度、碳13呼气试验、粪便检查、血常规起始',
  12: '血常规续页、尿生化、空腹胰岛素、尿常规起始',
  13: '尿常规续页、肿瘤标志物、胃功能',
  14: '同型半胱氨酸、肝肾功能、血脂、血糖、电解质、炎症指标、糖化血红蛋白',
  15: '肝纤维化、甲状腺功能、维生素、EB病毒及其他检验',
  16: '第15页检验结果续页（如有）',
};

function promptForPage(pageNum) {
  const sections = PAGE_SECTIONS[pageNum] || '本页原始明细';
  return `\n\n【浙一体检报告第${pageNum}页适配规则，最高优先级】
本页应按原版顺序处理：${sections}。
1. 本页中的一般检查、眼科、耳鼻喉科、口腔科、内科、外科必须按表格中的每一个“项目名称”逐行输出；一行对应一个item。name=该行项目名称，sourceSection=科室名称，findings=该行检查结果，itemType="imaging"（一般检查数值行可用data）。严禁把整个科室合并成一条。
2. “科室小结”“小结”“建议”“健康宣教”全部跳过，不生成item，也不得写入findings/diagnosis/conclusion。
3. 肝胆脾胰组合超声必须拆成肝脏超声、胆囊超声、脾脏超声、胰腺超声四条；双肾相关内容另列肾脏超声。每条只能包含对应器官原文。
4. 检验表格逐行输出，每个指标一条lab，项目、结果、单位、参考范围必须严格同行对应。
5. 输出顺序必须与本页从上到下的阅读顺序一致。`;
}

function needsCoverageAudit(pageNum, items) {
  const pageItems = (items || []).filter(item => Number(item?._page) === pageNum);
  const names = pageItems.map(item => `${text(item.name)} ${text(item.sourceSection)} ${text(item.orderName)}`).join(' ');
  if (pageNum === 6) return pageItems.length < 20 || !/视力/.test(names) || !/扁桃体|悬雍垂/.test(names);
  if (pageNum === 7) return pageItems.length < 20 || !/口腔|牙齿/.test(names) || !/心脏/.test(names) || !/直肠/.test(names);
  if (pageNum === 8) return pageItems.length < 7 || !/眼压/.test(names) || !/体重控制/.test(names) || !/肺通气/.test(names);
  if (pageNum === 9) return ![/肺.*CT/, /肾/, /肝/, /胆/, /脾/, /胰/].every(pattern => pattern.test(names));
  if (pageNum === 10) return ![/甲状腺/, /颈动脉/, /前列腺/, /心脏/].every(pattern => pattern.test(names));
  if (pageNum === 11) return ![/心电图/, /骨密度/, /13|碳13/, /隐血/].every(pattern => pattern.test(names));
  if (pageNum === 12) return pageItems.length < 25 || !/白细胞计数/.test(names) || !/尿微量白蛋白/.test(names) || !/空腹胰岛素/.test(names);
  if (pageNum === 13) return pageItems.length < 30 || !/总前列腺/.test(names) || !/胃蛋白酶原/.test(names);
  if (pageNum === 14) return pageItems.length < 40 || !/总胆固醇/.test(names) || !/糖化血红蛋白/.test(names);
  if (pageNum === 15) return pageItems.length < 15 || !/甲状腺/.test(names) || !/维生素/.test(names);
  return false;
}

function normalizeZheyiItems(items) {
  return (items || []).filter(item => pageMode(Number(item?._page || 0)) === 'extract');
}

module.exports = { isZheyiReport, pageMode, promptForPage, needsCoverageAudit, normalizeZheyiItems };
