const { validDay } = require('../../../shared/annualAppointment.cjs');
const text = value => typeof value === 'string' ? value.trim() : '';
const stem = value => text(value).split(/[（(]/)[0].replace(/[\s、，,：:]/g, '').toLowerCase();
const relatedGroup = name => /(?:阴道|子宫|附件).*(?:超声|彩超)|(?:超声|彩超).*(?:子宫|附件)/.test(name) ? '盆腔超声（方式未必相同）' : stem(name);

// Audit data only. Never substitute upload time, report year, or pathology date for an examination date.
function reportTimeline(reports = []) {
  const rows = [];
  for (const report of reports) {
    const date = validDay(report.checkDate) ? report.checkDate : '';
    const items = report.reportItems?.length ? report.reportItems : [{ name: report.title }];
    items.forEach((item, index) => {
      const itemDate = text(item.examDate);
      const name = text(item.name) || text(report.title);
      rows.push({ id: `report:${report._id}:${item.itemId || index}`, reportTitle: report.title || '', name,
        date: itemDate ? (validDay(itemDate) ? itemDate : '') : date,
        dateSource: itemDate ? '项目检查日期' : '报告检查日期（项目未单列日期）',
        modality: item.modality || '', group: /病理/.test(report.title || '') || report.type === 'pathology' ? `病理:${stem(name)}` : relatedGroup(name),
        result: [item.value, item.findings, item.diagnosis, item.conclusion].filter(Boolean).join('；'),
      });
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

const clinicalRulesPrompt = `【逐项日期与跨模块核对——必须执行】
report_history是已审核原报告项目时间线，优先于旧AI汇总。日期取项目检查日期，否则取报告检查日期，不能用上传时间或报告年份推算。引用旧检查时必须对比同项目及相关部位的更新检查；例如子宫附件彩超与阴道超声有关联，但检查途径不一定相同，不得擅自改名或认定完全替代。原汇总与原报告冲突需明确指出，由顾问核对。
任何非空timingBaseDate必须同时给timingSourceId，精确引用时间线项目id与date；引用较旧的同组检查时，dateSelectionReason必须解释为何更新检查不能代替，不能把旧检查称为最近一次。没有可靠日期不编造，留空说明。医学间隔建议仍交顾问审核。
medical_treatment/checkup_completion/abnormal_followup中相隔1—14天的事项必须逐对统筹：可合并时优先同一天，优先较早可行日期，不得延误紧急事项。需要拆开或兼容性不确定时，在相应事项scheduleSeparationReason写明医嘱、准备/先后顺序、时限或待核实原因，不编造医院号源。无证据不得强行合并，医院不确定留空。
年度体检focus每行一个具体项目；不能把今年近期已安排的完善检查清单复制到明年。确需再次复查，必须提供futureRepeatReason及futureRepeatSourceId（输入来源ID）说明独立的复查依据/间隔；否则只保留确应在年度体检关注的事项。完善检查通常安排近期2—4周，若医嘱不同以医嘱为准；不急且有依据延后的放入下次年度体检，不能两处重复排期。
逐项核对已有胃镜/肠镜及病理的检查日期、结果和明确复查建议：只有证据支持在下一年度复查才加入年度关注；没有明确间隔时在report_history的evidenceCoverage.reason说明待顾问评估，不得遗漏核对或擅自按年重复。以上都是待顾问审核建议，不是预约确认。`;

function validateClinicalRules(raw, timeline, evidence = []) {
  const fail = message => { throw Object.assign(new Error(message + '；未替换原方案，请核对生成依据'), { statusCode: 409 }); };
  const indexed = new Map(timeline.map(row => [row.id, row]));
  const scheduled = ['medical_treatment', 'checkup_completion', 'abnormal_followup'].flatMap(key =>
    (raw[key] || []).map(row => ({ ...row, scheduledDate: key === 'medical_treatment' ? row.visit_time : row.time })));
  const all = [...scheduled, ...(raw.vaccine || []), ...(raw.templateNodes || []), raw.annual_checkup || {}];
  for (const row of all) {
    if (!row.timingBaseDate) continue;
    const source = indexed.get(row.timingSourceId);
    if (!source?.date || source.date !== row.timingBaseDate) fail('建议时间的原检查日期与报告不一致');
    if (timeline.some(other => other.group === source.group && other.date > source.date) && !text(row.dateSelectionReason)) fail('引用旧检查但未说明较新相关检查的处理');
  }
  for (let i = 0; i < scheduled.length; i++) for (let j = i + 1; j < scheduled.length; j++) {
    const a = scheduled[i], b = scheduled[j];
    if (!validDay(a.scheduledDate) || !validDay(b.scheduledDate)) continue;
    const days = Math.abs(Date.parse(a.scheduledDate) - Date.parse(b.scheduledDate)) / 86400000;
    if (days > 0 && days <= 14 && !text(a.scheduleSeparationReason) && !text(b.scheduleSeparationReason)) fail('相近就医检查日期尚未统筹，也未说明分开原因');
  }
  const annual = raw.annual_checkup || {};
  const focus = text(annual.focus).split(/[\n；;]/).map(stem).filter(Boolean);
  const duplicate = scheduled.some(row => {
    const name = stem(row.items || row.name);
    return name.length >= 3 && focus.some(line => line.includes(name)) && (!validDay(annual.date) || !validDay(row.scheduledDate) || row.scheduledDate <= annual.date);
  });
  if (duplicate && (!text(annual.futureRepeatReason) || !evidence.some(item => item.id === annual.futureRepeatSourceId))) fail('年度关注重复近期检查，缺少再次复查依据');
  return raw;
}
module.exports = { reportTimeline, clinicalRulesPrompt, validateClinicalRules };
