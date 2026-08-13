const text = value => String(value || '').trim();

function isZheyiReport(report) {
  const haystack = [report?.title, report?.institution, report?.hospital].map(text).join(' ');
  return /浙一|浙江大学医学院附属第一医院|浙江大学医学院附属一院/.test(haystack);
}

function pageMode(pageNum) {
  if (pageNum >= 1 && pageNum <= 5) return 'skip';
  if (pageNum >= 6 && pageNum <= 15) return 'extract';
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
};

function promptForPage(pageNum) {
  const sections = PAGE_SECTIONS[pageNum] || '本页原始明细';
  return `\n\n【浙一体检报告第${pageNum}页适配规则，最高优先级】
本页应按原版顺序处理：${sections}。
1. 一般检查必须逐行输出data，心率命名为“脉搏心率”，体重不得遗漏。眼科、耳鼻喉科、牙科、内外科（全科）各科室只输出一条imaging检查项目，科内全部印刷明细按“项目：原文结果”逐行写入findings，不得拆成lab/data。建议文字并入对应科室findings，不单独输出。眼压单独输出一条“眼压检查”。
2. “科室小结”“小结”“建议”“健康宣教”全部跳过，不生成item，也不得写入findings/diagnosis/conclusion。
3. 肝胆脾胰组合超声必须拆成肝脏超声、胆囊超声、脾脏超声、胰腺超声四条；双肾相关内容另列肾脏超声。每条只能包含对应器官原文。
4. 所有检验表格逐行输出，每个指标一条lab，项目、结果、单位、参考范围必须严格同行对应。尿常规和粪便常规也必须逐项拆分，不得合并成摘要；尿生化、尿微量白蛋白/尿肌酐和独立便潜血同样逐项提取。
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
  let kept = (items || []).filter(item => pageMode(Number(item?._page || 0)) === 'extract');
  // 科室报告按实际印刷的检查项目保留；只剔除建议/小结，不再合并成一个科室摘要。
  kept = kept.filter(item => !/小结|建议|健康宣教/.test(text(item.name))
    && !(/痔疮/.test(text(item.name)) && /建议/.test(`${text(item.findings)} ${text(item.value)} ${text(item.diagnosis)} ${text(item.conclusion)}`)));

  const expanded = [];
  const segment = (source, start, stops) => {
    const startIndex = source.search(start);
    if (startIndex < 0) return '';
    const tail = source.slice(startIndex);
    let end = tail.length;
    for (const stop of stops) {
      const match = tail.slice(1).search(stop);
      if (match >= 0) end = Math.min(end, match + 1);
    }
    return tail.slice(0, end).trim();
  };
  for (const item of kept) {
    const context = `${text(item.name)} ${text(item.sourceSection)} ${text(item.orderName)}`;
    const findings = text(item.findings || item.value);
    if (/肝胆(?:脾胰|胰脾)|肝胆脾胰/.test(context) && findings) {
      const defs = [
        ['肝脏超声', /肝(?:脏)?(?:外形|大小|实质|包膜)/, [/胆囊/, /脾(?:脏)?(?:外形|大小|实质)/, /胰腺/]],
        ['胆囊超声', /胆囊/, [/脾(?:脏)?(?:外形|大小|实质)/, /胰腺/, /肝(?:脏)?(?:外形|大小|实质|包膜)/]],
        ['脾脏超声', /脾(?:脏)?(?:外形|大小|实质)/, [/胰腺/, /肝(?:脏)?(?:外形|大小|实质|包膜)/, /胆囊/]],
        ['胰腺超声', /胰腺/, [/肝(?:脏)?(?:外形|大小|实质|包膜)/, /胆囊/, /脾(?:脏)?(?:外形|大小|实质)/]],
      ];
      const parts = defs.map(([name, start, stops]) => ({ name, findings: segment(findings, start, stops) })).filter(row => row.findings);
      if (parts.length >= 2) {
        parts.forEach(row => expanded.push({ ...item, name: row.name, sourceSection: row.name, itemType: 'imaging', value: '', findings: row.findings, diagnosis: /肝脏/.test(row.name) ? text(item.diagnosis || item.conclusion) : '', conclusion: /肝脏/.test(row.name) ? text(item.conclusion || item.diagnosis) : '' }));
        continue;
      }
    }
    if (/甲状腺.*颈部淋巴结/.test(context) && /颈动脉/.test(findings)) {
      const carotidAt = findings.search(/(?:彩色超声检查)?双侧颈动脉|左侧及右侧颈总动脉/);
      if (carotidAt > 0) {
        expanded.push({ ...item, name: '甲状腺超声', sourceSection: '甲状腺+颈部淋巴结超声', findings: findings.slice(0, carotidAt).trim(), diagnosis: text(item.diagnosis).replace(/双侧颈动脉[^；。]*/g, '').trim(), conclusion: text(item.conclusion).replace(/双侧颈动脉[^；。]*/g, '').trim() });
        expanded.push({ ...item, name: '颈动脉超声', sourceSection: '颈动脉超声', findings: findings.slice(carotidAt).trim(), diagnosis: (text(item.diagnosis).match(/双侧颈动脉[^；。]*/) || [''])[0], conclusion: (text(item.conclusion).match(/双侧颈动脉[^；。]*/) || [''])[0] });
        continue;
      }
    }
    if (/膀胱.*前列腺/.test(context) && findings) {
      const prostateAt = findings.search(/前列腺/);
      if (prostateAt > 0) {
        expanded.push({ ...item, name: '膀胱超声', sourceSection: '膀胱超声', findings: findings.slice(0, prostateAt).trim(), diagnosis: '', conclusion: '' });
        expanded.push({ ...item, name: '前列腺超声', sourceSection: '前列腺超声', findings: findings.slice(prostateAt).trim(), diagnosis: text(item.diagnosis || item.conclusion), conclusion: text(item.conclusion || item.diagnosis) });
        continue;
      }
    }
    expanded.push(item);
  }
  kept = expanded;

  kept = kept.map(item => {
    const context = `${text(item.name)} ${text(item.sourceSection)} ${text(item.orderName)}`;
    const next = { ...item };
    if (/^(心率|脉率|脉搏)$/i.test(text(next.name))) next.name = '脉搏心率';
    if (/体重/.test(context) && !/体重指数|BMI/i.test(context)) next.name = '体重';
    if (/眼压/.test(context)) { next.name = '眼压检查'; next.itemType = 'imaging'; }
    if (/糖尿病.*(?:早期)?风险.*检测|糖尿病风险筛查/.test(context)) { next.name = '糖尿病早期风险检测'; next.itemType = 'imaging'; next.findings = text(next.findings || next.value || next.diagnosis || next.conclusion); next.value = ''; next.unit = ''; next.referenceRange = ''; }
    if (/肺部HR\s*CT|肺部.*高分辨率.*CT|胸部.*低剂量.*(?:螺旋)?CT|肺部.*CT/i.test(context)) next.name = '胸部（低剂量螺旋）CT';
    if (/肝脏.*(?:纤维)?弹性.*(?:超声|B超)/.test(context)) next.name = '肝脏弹性超声';
    if (/肺.*通气.*功能/.test(context)) next.name = '肺通气功能检查';
    if (/常规.*心电图|十二导.*心电图/.test(context)) next.name = '常规心电图';
    if (/骨密度/.test(context)) { next.name = '骨密度'; next.itemType = 'imaging'; next.findings = text(next.findings || next.value || next.diagnosis || next.conclusion); next.value = ''; next.unit = ''; next.referenceRange = ''; }
    if (/13.*(?:碳|C).*呼气|(?:碳|C)13.*呼气/i.test(context)) { next.name = '碳13/14呼气试验'; next.orderName = '碳13/14呼气试验'; next.itemType = 'imaging'; next.findings = text(next.findings || next.value || next.diagnosis || next.conclusion); next.value = ''; next.unit = ''; next.referenceRange = ''; }
    if (/尿生化|尿微量白蛋白|尿肌酐|尿白蛋白.*肌酐/.test(`${text(next.sourceSection)} ${text(next.orderName)}`)) next.orderName = '尿肾功能';
    if (/总前列腺特异|总PSA|TPSA/i.test(context)) next.orderName = '男性特定肿瘤标志物';
    else if (/游离前列腺特异|游离前列腺抗原比值|F-?PSA|FPSA/i.test(context)) next.orderName = '男性特定肿瘤标志物';
    else if (/甲胎蛋白|癌胚抗原|糖抗原|细胞角蛋白|神经元特异|鳞状细胞癌/.test(context)) next.orderName = '泛肿瘤标志物';
    if (/层[粘黏]连蛋白|血清透明质酸|三型前胶原N端肽|IV\s*型胶原|壳多糖酶3样蛋白1|CHI3L1/i.test(context)) next.orderName = '肝纤维化指标';
    if (/维生素A|维生素E|维生素K1/.test(context)) next.orderName = '其他维生素类';
    if (/肝脏弹性超声|肺通气功能检查/.test(next.name)) {
      next.diagnosis = text(next.diagnosis || next.conclusion);
      next.conclusion = text(next.conclusion || next.diagnosis);
    }
    return next;
  });
  const eyePressure = kept.filter(item => item.name === '眼压检查');
  if (eyePressure.length > 1) {
    const best = eyePressure.sort((a, b) => text(b.findings || b.value).length - text(a.findings || a.value).length)[0];
    kept = kept.filter(item => item.name !== '眼压检查');
    kept.push(best);
  }
  kept = kept.filter(item => !/痔疮/.test(`${text(item.name)} ${text(item.sourceSection)} ${text(item.orderName)}`));
  return kept.sort((a, b) => Number(a._page || 0) - Number(b._page || 0) || Number(a._order || 0) - Number(b._order || 0));
}

module.exports = { isZheyiReport, pageMode, promptForPage, needsCoverageAudit, normalizeZheyiItems };
