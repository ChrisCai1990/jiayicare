const normal = value => String(value || '').normalize('NFKC').toUpperCase().replace(/[\s‐‑–—－-]/g, '');
const chest = /胸部平扫|(?:胸部?|双?肺)(?:部|部位|低剂量|薄层|高分辨率?|螺旋|平扫|增强|多层|多排|扫描|计算机断层)*CT|CT(?:扫描|平扫|检查|增强|薄层|螺旋|影像|[（(：:])*[胸肺]|LDCT/;
const hp = /^(?:碳13|碳14|C13|C14|13C|14C)$|幽门螺(?:旋)?杆菌|尿素呼[气氣]|(?:13C|14C|C13|C14|碳13|碳14)(?:尿素)?呼[气氣]|(?:13C|14C|C13|C14|碳13|碳14)尿素|(?:^|[^A-Z])HP(?![A-Z])|(?:^|[^A-Z])UBT(?![A-Z])/;
const undecided = /未做|未查|未完成|未检测|待完善|建议(?:行|做|检查)|拟行|预约|取消|未出结果/;
function examName(key, value) {
  const text = normal(value);
  return key === 'chest_ct' ? chest.test(text) : hp.test(text);
}
function itemMatches(key, item) {
  const fields = [item.name, item.orderName, item.screeningKey, ...(item.screeningKeys || []), item.screeningParent];
  if (undecided.test([item.name, item.value, item.orderName].join(' '))) return false;
  if (fields.some(v => examName(key, v))) return true;
  if (key === 'chest_ct') return /胸|肺/.test(item.bodyPart || '') && /^CT$/.test(normal(item.modality));
  return fields.some(v => /^(?:呼气试验|呼气实验|呼氣試驗)(?:结果)?$/.test(normal(v))) &&
    /阴性|阳性|陰性|陽性|DOB|HP|幽门螺|尿素/i.test([item.value,item.conclusion,item.diagnosis].join(' ')) &&
    !/氢|甲烷|乳糖|葡萄糖|果糖|小肠/.test(fields.join(' '));
}
function examRecords(reports, key) {
  const records = [];
  for (const report of reports) {
    if (report.archiveOnly || report.audit_status && report.audit_status !== 'audited') continue;
    const date = report.checkDate || report.date || '';
    const items = report.reportItems || [];
    const add = (day, matches) => {
      const value = day instanceof Date ? day.toISOString() : String(day || '');
      records.push({ date: value, year: Number(value.slice(0, 4)) || Number(report.reportYear), items: matches });
    };
    const matched = items.filter(item => itemMatches(key, item));
    if (matched.length) for (const item of matched) add(item.examDate || date, [item]);
    else if (!undecided.test(report.title || '') && [report.title, report.screeningL2].some(v => examName(key, v))
      && !items.some(it => undecided.test([it.value,it.name].join(' ')))) add(date, []);
  }
  return records.sort((a,b) => b.date.localeCompare(a.date));
}
module.exports = { examName, examRecords };
