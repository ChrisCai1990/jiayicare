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
本页一般普通检查必须逐行输出身高、体重、收缩压、舒张压、体重指数/BMI、脉搏等原图实际行。体重位于身高与BMI附近，必须读取原始印刷值和单位，禁止遗漏，禁止用BMI反算。内外科栏每一行单独输出。`;
  if (pageNum === 8) return `\n\n【杭州明州版式 P8 强制逐行】
本页含外科续表、眼科和耳鼻喉科。眼科必须分别输出左眼裸视力、右眼裸视力、左眼矫正视力、右眼矫正视力、外眼、眼底等原图实际行；左右裸眼视力原结果栏为空时 findings="无"，绝不能复制矫正视力数值。眼底长段原文只能属于独立“眼底”项目。耳鼻喉科必须输出现病史、既往史、手术史、耳部、鼻部、咽部、喉部，结果为无也不得省略。`;
  return '';
}

function needsCoverageAudit(pageNum) {
  return pageNum === 7 || pageNum === 8;
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
    if (page === 8 && /[左右]眼?(?:裸眼|裸视力|裸眼视力)/.test(name)) {
      if (/眼底|视盘|视网膜|激光斑|C\/D/i.test(itemContent)) {
        recoveredFundus = recoveredFundus || itemContent;
        fundusSeed = fundusSeed || item;
      }
      result.push({ ...item, value: '', unit: '', referenceRange: '', findings: '无', diagnosis: '', conclusion: '', status: 'unknown' });
      continue;
    }
    result.push(item);
  }
  const existingFundus = result.find(item => Number(item?._page || item?.sourcePage || 0) === 8 && /眼底/.test(text(item.name)));
  if (recoveredFundus && !existingFundus) {
    result.push({
      ...(fundusSeed || {}), name: '眼底', itemType: 'imaging', value: '', unit: '', referenceRange: '',
      findings: recoveredFundus, diagnosis: '', conclusion: '', status: 'unknown',
    });
  }
  return result.sort((a, b) => Number(a?._page || a?.sourcePage || 0) - Number(b?._page || b?.sourcePage || 0)
    || Number(a?._order || 0) - Number(b?._order || 0));
}

function pageIsComplete(pageNum, items) {
  const pageItems = (items || []).filter(item => Number(item?._page || item?.sourcePage || 0) === Number(pageNum));
  const names = pageItems.map(item => text(item.name)).join(' ');
  if (pageNum === 7) return /体重(?!指数)|(?<!体重)weight/i.test(names);
  if (pageNum === 8) return /眼底/.test(names) && /咽部/.test(names);
  return true;
}

module.exports = { isMingzhouReport, pageMode, promptForPage, needsCoverageAudit, normalizeMingzhouItems, pageIsComplete };
