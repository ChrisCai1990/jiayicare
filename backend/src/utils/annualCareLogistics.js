const text = value => String(value || '').trim();
const reportLabel = value => /(?:体检|检查|检验|影像|病理|超声|内镜|化验).{0,8}(?:报告|结果|报告单)$|(?:报告|结果|报告单)$/.test(text(value));
const usablePlace = value => text(value) && !reportLabel(value) && !/^(待确认|未知|无|体检中心或|医院待确认)/.test(text(value));
const dentalAction = row => /洁牙|洗牙/.test([row.reason, row.items, row.name, row.standardPlanName].map(text).join(' '));

// A report title is evidence, never a destination. Preserve a verified visit or
// explicitly chosen clinic before falling back to the matching report institution.
function normalizeLogistics(raw, { reports = [], visits = [], dentalGift = null, today = '' } = {}) {
  const result = structuredClone(raw);
  for (const key of ['medical_treatment', 'checkup_completion', 'abnormal_followup']) {
    const rows = Array.isArray(result[key]) ? result[key] : [];
    for (const row of rows) {
      const title = text(row.hospital);
      if (title && (!usablePlace(title) || reports.some(report => title === text(report.title)))) row.hospital = '';
      if (text(row.hospital)) continue;
      const department = text(row.department).replace(/内科$|科$/, '');
      const dental = key === 'medical_treatment' && dentalAction(row);
      const activeDentalGift = dentalGift && !dentalGift.expired && ['unknown', 'available', 'booked'].includes(dentalGift.status);
      const visit = [...visits].filter(item => usablePlace(item.hospital) && (
        dental ? /口腔|牙科/.test(text(item.department)) : department && text(item.department).replace(/内科$|科$/, '') === department
      )).sort((a, b) => text(b.date).localeCompare(text(a.date)))[0];
      if (visit && !activeDentalGift) { row.hospital = visit.hospital; continue; }
      if (dental) {
        row.hospital = '艾维口腔';
        if (activeDentalGift) {
          row.notes = [text(row.notes), `客户有企业赠送洁牙权益，有效期至${dentalGift.expiresAt}；使用情况和艾维口腔预约须由工作人员核对，不视为已预约。`].filter(Boolean).join('\n');
          if (dentalGift.status === 'booked' && dentalGift.appointmentDate && (!today || dentalGift.appointmentDate >= today)) {
            row.visit_time = dentalGift.appointmentDate;
            row.timingReason = [text(row.timingReason), '沿用已登记的赠送洁牙预约日期，顾问仍需核对。'].filter(Boolean).join('\n');
          } else if (today && text(row.visit_time) > dentalGift.expiresAt && today <= dentalGift.expiresAt) {
            row.visit_time = dentalGift.expiresAt;
            row.timingReason = [text(row.timingReason), '建议在赠送洁牙权益有效期内安排，具体日期须与客户和机构核实。'].filter(Boolean).join('\n');
          }
        }
      }
    }
  }
  return result;
}

module.exports = { normalizeLogistics, usablePlace, dentalAction };
