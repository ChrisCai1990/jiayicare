const text = value => String(value || '').trim();

function isMingzhouReport(report) {
  const haystack = [report?.title, report?.institution, report?.hospital].map(text).join(' ');
  return /(?:杭州)?明州[医醫]院/.test(haystack);
}

function pageMode(pageNum) {
  return pageNum >= 3 && pageNum <= 6 ? 'skip' : 'extract';
}

function promptForPage(pageNum) {
  if (pageNum === 7) return `\n\n【杭州明州版式 P7 强制逐行】
本页一般普通检查必须逐行输出身高、体重、收缩压、舒张压、体重指数/BMI、脉搏等原图实际行。体重位于身高与BMI附近，必须读取原始印刷值和单位，禁止遗漏，禁止用BMI反算。内外科栏每一行单独输出。
本页外科栏的手术史(外科)、既往史(外科)、现病史(外科)即使结果为“无”也必须分别输出，不得省略。`;
  if (pageNum === 8) return `\n\n【杭州明州版式 P8 强制逐行】
本页含外科续表、眼科和耳鼻喉科。眼科必须分别输出左眼裸视力、右眼裸视力、左眼矫正视力、右眼矫正视力、外眼、眼底等原图实际行；左右裸眼视力原结果栏为空时 findings="无"，绝不能复制矫正视力数值。眼底长段原文只能属于独立“眼底”项目。耳鼻喉科必须输出现病史、既往史、手术史、耳部、鼻部、咽部、喉部，结果为无也不得省略。`;
  if (pageNum >= 9 && pageNum <= 13) return `\n\n【杭州明州版式 P${pageNum} 完整性强制】
本页不得跳过，必须按页面从上到下、从左到右逐行输出全部检查或检验项目。正常项和异常项都必须保留；不得只摘异常，不得把相邻检验单、科室或分栏混合。每项的 name、value、unit、referenceRange、sourceSection/orderName 必须来自同一行和当前栏目。status 无法从原图明确判定时输出 unknown，不得猜测。`;
  if (pageNum === 16) return `\n\n【杭州明州版式 P16 超声器官边界】
本页是多部位超声检查。只提取图片中能明确读到名称和对应正文的项目，不得按常见器官清单补齐。原文明确分段时按器官分别输出；无法可靠分段时保留原组合名称和原文。每条 findings 只允许放对应器官或组合检查的原文；诊断意见无法唯一归属时留空，禁止顺移或补造。`;
  return '';
}

function needsCoverageAudit(pageNum) {
  return pageNum >= 7 && pageNum <= 13;
}

function content(item) {
  return [item?.value, item?.findings, item?.diagnosis, item?.conclusion].map(text).filter(Boolean).join(' ');
}

function normalizeMingzhouItems(items) {
  const kept = (items || []).filter(item => pageMode(Number(item?._page || item?.sourcePage || 0)) === 'extract');
  const result = [];
  let recoveredFundus = '';
  let fundusSeed = null;
  for (const item of kept) {
    const page = Number(item?._page || item?.sourcePage || 0);
    const name = text(item.name);
    const itemContent = content(item);
    let normalizedItem = { ...item };
    if (page === 7 && /^(?:体重指数\/?BMI|BMI)$/i.test(name)) normalizedItem.name = '体重指数';
    if (page === 8) {
      if (/眼底|视力|外眼|眼压|晶状体|玻璃体|角膜|结膜|虹膜|前房/.test(name)) normalizedItem.sourceSection = '眼科';
      else if (/耳部|鼻部|咽部|喉部|听力|耳鼻喉/.test(name)) normalizedItem.sourceSection = '耳鼻喉科';
      else if (/浅表淋巴结|甲状腺|乳腺|脊柱|四肢|手术史|既往史|现病史/.test(name)) normalizedItem.sourceSection = '外科';
    }
    if (page === 8 && /[左右]眼?(?:裸眼|裸视力|裸眼视力)/.test(name)) {
      if (/眼底|视盘|视网膜|激光斑|C\/D/i.test(itemContent)) {
        recoveredFundus = recoveredFundus || itemContent;
        fundusSeed = fundusSeed || item;
      }
      result.push({ ...normalizedItem, value: '', unit: '', referenceRange: '', findings: '无', diagnosis: '', conclusion: '', status: 'unknown' });
      continue;
    }
    result.push(normalizedItem);
  }
  const existingFundus = result.find(item => Number(item?._page || item?.sourcePage || 0) === 8 && /眼底/.test(text(item.name)));
  if (recoveredFundus && !existingFundus) {
    result.push({
      ...(fundusSeed || {}), name: '眼底', itemType: 'imaging', value: '', unit: '', referenceRange: '',
      findings: recoveredFundus, diagnosis: '', conclusion: '', status: 'unknown',
    });
  }
  const page8Order = [
    /浅表淋巴结/, /甲状腺/, /乳腺/, /脊柱/, /四肢/,
    /左眼?(?:裸眼|裸视力|裸眼视力)/, /^眼底|眼底（眼科）/, /右眼?(?:裸眼|裸视力|裸眼视力)/,
    /现病史.*眼科/, /矫正左眼视力|左眼矫正视力/, /既往史.*眼科/, /矫正右眼视力|右眼矫正视力/, /手术史.*眼科/, /外眼/,
    /鼻部/, /咽部/, /本科既往史/, /喉部/, /耳部/, /耳鼻喉.*(?:紧急|严重).*通知/, /现病史.*耳鼻喉/, /手术史.*耳鼻喉/,
  ];
  const rank = item => {
    const page = Number(item?._page || item?.sourcePage || 0);
    if (page !== 8) return Number(item?._order || 0);
    const name = text(item.name);
    const index = page8Order.findIndex(pattern => pattern.test(name));
    return index < 0 ? 1000 + Number(item?._order || 0) : index;
  };
  const deduped = [];
  const seen = new Set();
  for (const item of result) {
    const key = [Number(item?._page || item?.sourcePage || 0), text(item.name).replace(/\/?BMI/ig, ''), text(item.sourceSection), text(item.value), text(item.findings)].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped.sort((a, b) => Number(a?._page || a?.sourcePage || 0) - Number(b?._page || b?.sourcePage || 0)
    || rank(a) - rank(b) || Number(a?._order || 0) - Number(b?._order || 0));
}

function pageIsComplete(pageNum, items) {
  const pageItems = (items || []).filter(item => Number(item?._page || item?.sourcePage || 0) === Number(pageNum));
  const names = pageItems.map(item => text(item.name)).join(' ');
  if (pageNum === 7) return /体重(?!指数)|(?<!体重)weight/i.test(names) && /手术史.*外科/.test(names);
  if (pageNum === 8) return /眼底/.test(names) && /咽部/.test(names);
  if (pageNum >= 9 && pageNum <= 13) return pageItems.length > 0;
  return true;
}

function selectOriginalWeight(items) {
  return (items || []).find(item => {
    const name = text(item?.name).replace(/[（(].*?[）)]/g, '').trim();
    const value = text(item?.value || item?.findings);
    const unit = text(item?.unit);
    return name === '体重' && /^\d{2,3}(?:\.\d+)?$/.test(value) && /^kg$/i.test(unit);
  }) || null;
}

module.exports = { isMingzhouReport, pageMode, promptForPage, needsCoverageAudit, normalizeMingzhouItems, pageIsComplete, selectOriginalWeight };
