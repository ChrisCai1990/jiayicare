const { createHash } = require('crypto');

const IMAGE_ONLY_MESSAGE = '影像资料页，无可自动核对的印刷检查结果。原图已保留，请查看文字报告；需要采用的手写内容由审核人员对照原件录入，图中测量标记不作为检查所见。';
const UNVERIFIED_MESSAGE = '部分内容未能与可见报告原文对应，已拦截自动提取，请对照原件人工核对。';
const IMAGE_EVIDENCE_PROMPT = `你是文档文字转录器，不是影像诊断助手。只看当前图片，不接受其他页面或先前生成结果作为依据。
判断页面是否包含医学影像（B超、CT、MRI、X线、内镜照片、心电波形等），并逐字转录图像区域之外印刷的检查结果、检查所见、诊断、提示及检验数值表格。手写批注不转录，需采用时交由人工核对。
sections[].clinicalText 只能是该栏目文字原文，保持原字、数字、单位、左右侧和否定词。不得摘要、改写、补全、看图诊断。
同一语句因排版换行时合并为完整语句，不得将“未/无/不/左/右”等字拆到另一段；独立段落之间保留换行。
不转录姓名等个人信息、医院、图像内的机器参数/距离数值/测量标记、人体位置示意图。栏目标题只放在 sections.title，不混入结果文字。
纯医学影像页没有印刷文字所见时，hasMedicalImages=true，readability="clear"，sections=[]；印刷文字模糊或被裁切无法确认时 readability="unreadable"，禁止猜测。仅手写难辨不影响印刷文字的readability。
图文混排页必须保留图外真实的全部检查文字；纯文字报告即使标题为超声也不算包含医学影像。
超声报告图外印刷的“超声描述”和“超声诊断/医师意见”要分别转录；尤其核对页面下方的小字诊断栏。诊断栏下方印刷的分级解释、概率和参考文献与本次患者诊断分开转录，不得混为一句；手写覆盖印刷文字时，只转录仍能确认的印刷内容。
按原件印刷的栏目边界分别转录，不要把上一栏目的所见接到下一栏目。每个 sections 元素只包含该栏目之下、下一栏目标题之前的文字；同一栏目的检查所见和诊断均保留。栏目标题不清楚时 title=""，不要猜。
检验表格按真实印刷行写入 sections[].rows，每行分别填写原文项目名、结果、单位、参考范围；任何字段不清楚则留空，不得借用相邻行。叙述性所见和诊断写入 clinicalText；没有表格行时 rows=[]。栏目顺序按页面阅读顺序，不依赖医院或固定模板。
严格返回 JSON：{"hasMedicalImages":true,"readability":"clear","sections":[{"title":"原件栏目标题","clinicalText":"该栏目叙述原文或空字符串","rows":[{"name":"","value":"","unit":"","referenceRange":""}]}]}。没有印刷检查文字和表格行时 sections=[]。`;

function parseJSON(raw) {
  try { return JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { return null; }
}

function normalizeText(value) {
  // Preserve decimals, signs, laterality and negation. Only layout and equivalent typography differ.
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[×＊]/g, '*').replace(/[\s，,。；;：:、()\[\]【】]/g, '');
}

function isAnchored(value, transcript) {
  const parts = String(value || '').split(/[\n。；;]/).map(normalizeText).filter(Boolean);
  return parts.length > 0 && parts.every(part => transcript.includes(part));
}

function isNarrativeAnchored(value, clinicalText) {
  // Match whole printed clauses, not arbitrary substrings: “见异常” must not match “未见异常”.
  const clauses = text => String(text || '')
    .split(/[\r\n。；;，,：:]/).map(normalizeText).filter(Boolean);
  const source = new Set(clauses(clinicalText));
  const parts = clauses(value);
  return parts.length > 0 && parts.every(part => source.has(part));
}

function cleanClinicalTranscript(text) {
  return String(text || '').split(/\r?\n/).filter(line => {
    const value = line.trim();
    // The independent model occasionally copies headings/footers despite the prompt. Never let
    // those turn an image-only page into a detailed report. Keep any header line containing results.
    const resultWords = /所见|诊断|提示|未见|可见|正常|异常|回声|结节|病变|扩张|狭窄|增大|增厚/;
    if (/^(检查项目|检查部位|检查名称|报告名称|检查日期|检查时间|检查者|审核医生|报告医师|姓名|性别|年龄|病案号|门诊号|住院号)\s*[:：]/.test(value)
        && !resultWords.test(value.replace(/^[^:：]+[:：]/, ''))) return false;
    if (/^(?:此|本)(?:报告|资料|图片|文档).*(?:仅供|只供).*(?:参考|教学|测试|演示)/.test(value)) return false;
    if (/^(?:仅|只)(?:供|用于).*(?:参考|教学|测试|演示|示例)/.test(value)) return false;
    if (/^(?:距离|深度|频率|增益|distance|dist|depth|gain|MI|TIS|TIB)\s*[:：=]?\s*[\d.]+\s*(?:cm|mm|MHz|dB)?\s*$/i.test(value)) return false;
    return true;
  }).join('\n');
}

function evidenceSections(evidence) {
  if (!Array.isArray(evidence?.sections)) return null;
  if (evidence.sections.some(section => !section || typeof section.title !== 'string' || typeof section.clinicalText !== 'string'
      || (section.rows !== undefined && (!Array.isArray(section.rows) || section.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)
        || ['name', 'value', 'unit', 'referenceRange'].some(field => row[field] != null && !['string', 'number'].includes(typeof row[field]))))))) return null;
  return evidence.sections.map(section => ({
    title: section.title, clinicalText: cleanClinicalTranscript(section.clinicalText),
    rows: Array.isArray(section.rows) ? section.rows.map(row => ({
      name: String(row.name ?? ''), value: String(row.value ?? ''), unit: String(row.unit ?? ''),
      referenceRange: String(row.referenceRange ?? ''),
    })) : null,
  }));
}

function sectionForItem(item, sections) {
  const normalized = value => normalizeText(value).replace(/(?:检查|超声|彩超|b超)$/i, '');
  const uniqueMatch = value => {
    const title = normalized(value);
    if (!title) return null;
    const matches = sections.filter(section => {
      const heading = normalized(section.title);
      return heading && (heading === title || heading.includes(title) || title.includes(heading));
    });
    return matches.length === 1 ? matches[0] : null;
  };
  const source = uniqueMatch(item.sourceSection) || uniqueMatch(item.orderName);
  const named = uniqueMatch(item.name);
  if (source && named && source !== named) return null;
  return source || named;
}

function hasSamePrintedLabRow(item, sections) {
  if (!sections?.length || !normalizeText(item.name) || !normalizeText(item.value)) return false;
  const titled = (item.sourceSection || item.orderName) ? sectionForItem(item, sections) : null;
  if (!titled && sections.length > 1 && (item.sourceSection || item.orderName)) return false;
  const eligible = titled ? [titled] : sections;
  const hasField = (row, field) => {
    const value = normalizeText(field);
    if (!value) return false;
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return row.includes(value);
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\d.])${escaped}(?![\\d.])`).test(row);
  };
  return eligible.some(section => {
    const printedRows = section.rows?.length
      ? section.rows.map(row => `${row.name} ${row.value} ${row.unit} ${row.referenceRange}`)
      : section.clinicalText.split(/\r?\n/);
    return printedRows.some(line => {
    const row = normalizeText(line);
    return hasField(row, item.name) && hasField(row, item.value)
      && (!item.unit || hasField(row, item.unit));
    });
  });
}

function findUncoveredPrintedRows(sections, items) {
  if (!sections?.some(section => section.rows?.length)) return { total: 0, rows: [] };
  const normalize = value => normalizeText(value);
  const seen = new Set();
  let total = 0;
  const rows = [];
  for (const section of sections) for (const row of section.rows || []) {
    if (!normalize(row.name) || !normalize(row.value)) continue;
    const key = [normalize(section.title), normalize(row.name), normalize(row.value), normalize(row.unit)].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    total++;
    const covered = (items || []).some(item => ['lab', 'data'].includes(item.itemType)
      && normalize(item.name) === normalize(row.name) && normalize(item.value) === normalize(row.value)
      && (!normalize(item.unit) || !normalize(row.unit) || normalize(item.unit) === normalize(row.unit))
      && (!item.sourceSection || !section.title || sectionForItem(item, [section]) !== null));
    if (!covered) rows.push({ sectionTitle: section.title, name: row.name, value: row.value });
  }
  return { total, rows };
}

function countUncoveredPrintedRows(sections, items) {
  const result = findUncoveredPrintedRows(sections, items);
  return { total: result.total, uncovered: result.rows.length };
}

function guardImageEvidence(parsed, evidence, { requireSectionEvidence = false, verifyTableRows = false, existingItems = [] } = {}) {
  if (!evidence || typeof evidence.hasMedicalImages !== 'boolean'
      || !['clear', 'unreadable'].includes(evidence.readability)
      || (typeof evidence.clinicalText !== 'string' && !evidenceSections(evidence))) {
    throw new Error('影像页原文校验未返回有效结果，请重试或人工核对');
  }
  const sections = evidenceSections(evidence);
  if (!evidence.hasMedicalImages && evidence.readability === 'clear' && !sections
      && !requireSectionEvidence && !verifyTableRows) return parsed;
  const candidates = Array.isArray(parsed.items) ? parsed.items : [];
  const clinicalText = sections?.length ? sections.map(section => [section.clinicalText,
    ...(section.rows || []).map(row => `${row.name} ${row.value} ${row.unit} ${row.referenceRange}`)].join('\n')).join('\n')
    : cleanClinicalTranscript(evidence.clinicalText);
  const transcript = normalizeText(clinicalText);
  const imageOnly = evidence.hasMedicalImages === true && evidence.readability === 'clear' && !transcript;
  const blockedReasons = { section_mismatch: 0, row_mismatch: 0, uncovered_rows: 0, unverified_text: 0, unreadable: 0 };
  const items = evidence.readability !== 'clear' || imageOnly ? [] : candidates.filter(item => {
    const imaging = ['imaging', 'diagnosis', 'pathology'].includes(item.itemType);
    const section = imaging && sections ? sectionForItem(item, sections) : null;
    if (imaging && ((sections && !section) || (requireSectionEvidence && !sections))) {
      blockedReasons.section_mismatch++;
      return false;
    }
    const itemText = section ? section.clinicalText : clinicalText;
    const fields = ['findings', 'diagnosis', 'conclusion', 'pathologyFindings', 'pathologyDiagnosis'];
    if (fields.some(key => String(item[key] || '').trim() && !isNarrativeAnchored(item[key], itemText))) {
      blockedReasons.unverified_text++;
      return false;
    }
    if (item.itemType === 'lab' || item.itemType === 'data' || item.itemType === 'medication') {
      if (verifyTableRows && ['lab', 'data'].includes(item.itemType) && !hasSamePrintedLabRow(item, sections)) {
        blockedReasons.row_mismatch++;
        return false;
      }
      const valid = isAnchored(item.name, transcript) && isAnchored(item.value, transcript)
        && (!item.unit || isAnchored(item.unit, transcript));
      if (!valid) blockedReasons.unverified_text++;
      return valid;
    }
    // Neither a project title nor a caliper number is a narrative finding.
    const valid = ['findings', 'diagnosis'].some(key => isNarrativeAnchored(item[key], itemText))
      && (!item.value || isAnchored(item.value, transcript));
    if (!valid) blockedReasons.unverified_text++;
    return valid;
  });
  const blockedCount = candidates.length - items.length;
  if (evidence.readability !== 'clear' || imageOnly) blockedReasons.unreadable = blockedCount;
  const rowCoverage = verifyTableRows && !imageOnly && evidence.readability === 'clear'
    ? countUncoveredPrintedRows(sections, [...existingItems, ...items]) : { total: 0, uncovered: 0 };
  blockedReasons.uncovered_rows = rowCoverage.uncovered;
  const status = imageOnly ? 'image_only'
    : evidence.readability !== 'clear' || blockedCount || rowCoverage.uncovered ? 'needs_review' : 'verified';
  const pageEvidence = { status, blockedCount, blockedReasons, tableRowCount: rowCoverage.total,
    message: imageOnly ? IMAGE_ONLY_MESSAGE : blockedReasons.section_mismatch || blockedReasons.row_mismatch
      ? '检查栏目或检验表格行未能与原件对应，已拦截自动提取，请对照原件人工核对。'
      : blockedReasons.uncovered_rows ? '原件检验表有未进入审核草稿的结果行，请逐行对照原件补提或人工录入。'
      : status === 'needs_review' ? UNVERIFIED_MESSAGE : '' };
  return { ...parsed, items, summary: '', pageType: imageOnly ? 'image_only' : parsed.pageType,
    skipPage: imageOnly || (parsed.skipPage === true && !transcript), imageEvidence: pageEvidence };
}

// Shared by full PDF/image OCR and every supplement/retry. Independent transcription never sees
// candidate findings. Bounded per-job cache avoids paying for the same image on each retry.
function createReportImageParser(parseImage, { onEvidence = () => {}, report = {}, verifyTableRows = false } = {}) {
  const cache = new Map();
  const imageOnlyPages = new Map();
  const imageReport = /ultrasound|radiology|mri|endoscopy|ecg|imaging/i.test(report.type || '')
    || /超声|彩超|B超|内镜|胃镜|肠镜|磁共振|心电|CT|MRI|FibroScan|肝脏弹性纤维|肝脏弹性成像/i.test(report.title || '');
  return async (source, prompt, options = {}) => {
    const { sourcePage } = options;
    const modelOptions = { ...options, ...(report._id ? { reportId: String(report._id) } : {}) };
    const sourceKey = createHash('sha256').update(source).digest('hex');
    if (imageOnlyPages.has(sourceKey)) {
      const skipped = imageOnlyPages.get(sourceKey);
      onEvidence(sourcePage, skipped.imageEvidence);
      return JSON.stringify(skipped);
    }
    const raw = await parseImage(source, prompt, modelOptions);
    const parsed = parseJSON(raw);
    if (!parsed || !Array.isArray(parsed.items)) return raw;
    // Only this guard may attach verification metadata; model/source-provided flags are untrusted.
    delete parsed.imageEvidence;
    const needsCheck = imageReport || parsed.hasMedicalImages === true || parsed.pageType === 'image_only'
      || verifyTableRows
      || parsed.items.some(item => ['imaging', 'diagnosis', 'pathology'].includes(item.itemType)
        || item.findings || item.diagnosis || /超声|彩超|B超|内镜|心电|CT|MRI/i.test(item.name || ''));
    if (!needsCheck) return JSON.stringify(parsed);
    const key = sourceKey;
    if (!cache.has(key)) {
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      const pending = parseImage(source, IMAGE_EVIDENCE_PROMPT, {
        ...modelOptions, stage: 'evidence', model: 'qwen-vl-plus', maxTokens: 8192,
        timeoutMs: verifyTableRows ? 120000 : 45000,
      }).then(result => {
        const evidence = parseJSON(result);
        guardImageEvidence({ items: [] }, evidence); // Validate before caching.
        return evidence;
      }).catch(error => { cache.delete(key); throw error; });
      cache.set(key, pending);
    }
    let evidence;
    try { evidence = await cache.get(key); }
    catch (error) {
      onEvidence(sourcePage, { status: 'needs_review', blockedCount: parsed.items.length,
        message: '影像页原文校验未完成，未接受本次候选，请重试或人工核对。' });
      throw error;
    }
    const guarded = guardImageEvidence(parsed, evidence, {
      requireSectionEvidence: report.type === 'annual' || report.documentCategory === 'exam_report', verifyTableRows,
      existingItems: (report.reportItems || []).filter(item => Number(item.sourcePage || 1) === Number(sourcePage || 1)),
    });
    if (Number.isInteger(sourcePage) && guarded.imageEvidence?.status === 'image_only') {
      imageOnlyPages.set(sourceKey, guarded);
    }
    if (guarded.imageEvidence) onEvidence(sourcePage, guarded.imageEvidence, evidenceSections(evidence), options);
    return JSON.stringify(guarded);
  };
}

function recordPageEvidence(pages, page, evidence) {
  if (!Number.isInteger(page) || page < 1) return;
  // A later empty coverage response must not erase an earlier rejection warning.
  if (pages[page]?.status === 'needs_review' && evidence.status === 'verified') return;
  pages[page] = evidence;
}

module.exports = { IMAGE_ONLY_MESSAGE, UNVERIFIED_MESSAGE, IMAGE_EVIDENCE_PROMPT,
  guardImageEvidence, createReportImageParser, recordPageEvidence, findUncoveredPrintedRows };
