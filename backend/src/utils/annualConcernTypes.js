const REVIEWED_KINDS = new Set(['ai_health_trend', 'reviewed_chronic_tag', 'reviewed_cardiovascular_tag', 'reviewed_tumor_tag']);

function clinicalType(row) {
  if (!REVIEWED_KINDS.has(row.kind)) return row.clinicalType || 'health_issue';
  const title = String(row.title || '').replace(/\s/g, '');
  if (/[？?]$/.test(title) || /^待排/.test(title)) return 'question';
  if (/^(?:脂蛋白磷脂酶A2|Lp-?PLA2|同型半胱氨酸|Hcy)$/i.test(title)) return 'marker';
  if (/(?:超声|彩超|CTA|MRA|MRI|CT|磁共振|心电图|胃镜|肠镜|X线|造影)$/.test(title)) return 'examination';
  if (/(?:结节|息肉|斑块|增大|钙化|肠化|异位|异常|升高|降低|反流)/.test(title)) return 'finding';
  return 'health_issue';
}

function isEvidenceConcern(row) {
  return ['examination', 'marker'].includes(clinicalType(row));
}

module.exports = { clinicalType, isEvidenceConcern };
