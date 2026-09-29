const MAX_CONTEXT_CHARS = 45000;
const OMITTED = '【内容因篇幅省略，不能据此判断不存在】';
const MEDICATION_FIELDS = ['_id', 'name', 'brandName', 'brand', 'specification', 'dosage', 'method', 'frequency', 'timing', 'startDate', 'endDate', 'purpose', 'stopped', 'stopDate', 'stopReason', 'active', 'aiStatus', 'reviewedAt', 'sourceType', 'note'];
const REPORT_ITEM_FIELDS = ['name', 'value', 'unit', 'referenceRange', 'status', 'genericName', 'brandName', 'bodyPart', 'specimen', 'modality', 'reviewIssues', 'findings', 'diagnosis', 'examDate', 'institution', 'conclusion'];
const size = value => JSON.stringify(value).length;
const minimumSize = value => value !== null && ['string', 'object'].includes(typeof value) ? Math.min(size(value), size(OMITTED)) : size(value);
const pick = (value, fields) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));

// Allocate space across siblings, never slice serialized JSON or silently drop a
// whole section merely because a long report appeared before it.
function fit(value, budget) {
  if (size(value) <= budget) return value;
  if (typeof value === 'string') {
    let low = 0, high = value.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (size(value.slice(0, mid) + OMITTED) <= budget) low = mid;
      else high = mid - 1;
    }
    return value.slice(0, low) + OMITTED;
  }
  if (!value || typeof value !== 'object') return value;
  const array = Array.isArray(value);
  const entries = Object.entries(value);
  const overhead = array ? entries.length + 2 : entries.reduce((n, [key]) => n + size(key) + 2, 2);
  if (budget - overhead < entries.reduce((n, [, child]) => n + minimumSize(child), 0)) return OMITTED;
  const result = array ? [] : {};
  let remaining = budget - overhead;
  // Small fields remain intact; long siblings share the remaining budget.
  const ordered = [...entries].sort((a, b) => size(a[1]) - size(b[1]));
  ordered.forEach(([key, child], index) => {
    const reserved = ordered.slice(index + 1).reduce((n, [, sibling]) => n + minimumSize(sibling), 0);
    const childBudget = Math.min(remaining - reserved, Math.max(minimumSize(child), Math.floor(remaining / (ordered.length - index))));
    const next = fit(child, childBudget);
    result[key] = next;
    remaining -= size(next);
  });
  return result;
}

function prepareContext(context = {}) {
  const original = JSON.parse(JSON.stringify(context));
  // Classification/UI audit metadata and empty defaults used most of the report
  // budget. Keep clinical results before allocating space, without changing DB data.
  if (Array.isArray(original.reports)) original.reports = original.reports.map(report => ({
    ...report,
    ...(Array.isArray(report.reportItems) ? { reportItems: report.reportItems.map(item => Object.fromEntries(
      Object.entries(pick(item, REPORT_ITEM_FIELDS)).filter(([, value]) => value !== '' && value !== null && !(Array.isArray(value) && !value.length)),
    )) } : {}),
  }));
  const prepared = {};
  for (const key of ['capturedAt', 'patientId', 'basic']) {
    if (original[key] !== undefined) prepared[key] = original[key];
  }
  for (const key of ['medications', 'supplements']) {
    if (original[key] !== undefined) {
      if (!Array.isArray(original[key])) throw new Error('用药资料格式异常，请核对后重试');
      prepared[key] = original[key].map(item => pick(item, MEDICATION_FIELDS));
    }
  }
  const sources = Array.isArray(original.sources) ? original.sources : [];
  prepared.sources = sources;
  prepared.delivery = {
    version: 1,
    medicationScope: original.medications === undefined ? 'not_selected' : 'included',
    supplementScope: original.supplements === undefined ? 'not_selected' : 'included',
    compressedSections: [],
    note: '来源清单表示已纳入资料；压缩部分明确标记。未选入、空白、被省略均不等于确认无。独立用药/营养素记录优先于档案空字段和旧AI回复；审核及停用状态以各条记录为准。附件图片、打卡及配药工作流不作为用药正文发送。报告项目提取临床字段，不包含分类操作元数据及空白默认值。',
  };
  const sections = Object.entries(original).filter(([key]) => !['capturedAt', 'patientId', 'basic', 'medications', 'supplements', 'sources', 'delivery'].includes(key));
  // Reserve metadata space and guarantee a useful minimum for each other section.
  const available = MAX_CONTEXT_CHARS - size(prepared) - 2000;
  if (available < sections.length * 600) throw new Error('关键用药资料超出单轮容量，请缩小研判资料范围后重试；本轮未发送AI');
  let remaining = available;
  const ordered = [...sections].sort((a, b) => (a[0] === 'aiAnalysis' ? -1 : b[0] === 'aiAnalysis' ? 1 : size(a[1]) - size(b[1])));
  ordered.forEach(([key, value], index) => {
    const share = Math.floor(remaining / (ordered.length - index));
    const budget = key === 'aiAnalysis' ? Math.min(6000, share) : share;
    const next = fit(value, budget);
    prepared[key] = next;
    remaining -= size(next);
    if (size(value) > budget) prepared.delivery.compressedSections.push(key);
  });
  if (prepared.delivery.compressedSections.length) {
    prepared.sources = sources.map(source => `${source}（部分资料已压缩，详见正文标记）`);
  }
  if (size(prepared) > MAX_CONTEXT_CHARS) throw new Error('研判资料超出单轮容量，请缩小资料范围后重试；本轮未发送AI');
  return prepared;
}

module.exports = { prepareContext, MAX_CONTEXT_CHARS };
