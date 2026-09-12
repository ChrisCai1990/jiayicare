const { createHash } = require('crypto');

const IMAGE_ONLY_MESSAGE = '影像资料页，无文字检查结果。原图已保留，请查看文字报告或由医生填写；图中测量标记不作为检查所见。';
const UNVERIFIED_MESSAGE = '部分内容未能与可见报告原文对应，已拦截自动提取，请对照原件人工核对。';
const IMAGE_EVIDENCE_PROMPT = `你是文档文字转录器，不是影像诊断助手。只看当前图片，不接受其他页面或先前生成结果作为依据。
判断页面是否包含医学影像（B超、CT、MRI、X线、内镜照片、心电波形等），并逐字转录图像区域之外印刷或书写的检查结果、检查所见、诊断、提示及检验数值表格。
clinicalText 只能是这些文字原文，保持原字、数字、单位、左右侧和否定词。不得摘要、改写、补全、看图诊断。
同一语句因排版换行时合并为完整语句，不得将“未/无/不/左/右”等字拆到另一段；独立段落之间保留换行。
不转录姓名等个人信息、医院和检查项目标题、图像内的机器参数/距离数值/测量标记、人体位置示意图。仅有这些内容时 clinicalText=""。
纯医学影像页没有文字所见时，hasMedicalImages=true，readability="clear"，clinicalText=""；文字模糊或被裁切无法确认时 readability="unreadable"，禁止猜测。
图文混排页必须保留图外真实的全部检查文字；纯文字报告即使标题为超声也不算包含医学影像。
严格返回 JSON：{"hasMedicalImages":true,"readability":"clear","clinicalText":"逐字原文或空字符串"}`;

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

function guardImageEvidence(parsed, evidence) {
  if (!evidence || typeof evidence.hasMedicalImages !== 'boolean'
      || !['clear', 'unreadable'].includes(evidence.readability) || typeof evidence.clinicalText !== 'string') {
    throw new Error('影像页原文校验未返回有效结果，请重试或人工核对');
  }
  if (!evidence.hasMedicalImages && evidence.readability === 'clear') return parsed;
  const candidates = Array.isArray(parsed.items) ? parsed.items : [];
  const clinicalText = cleanClinicalTranscript(evidence.clinicalText);
  const transcript = normalizeText(clinicalText);
  const imageOnly = evidence.readability === 'clear' && !transcript;
  const items = evidence.readability !== 'clear' || imageOnly ? [] : candidates.filter(item => {
    const fields = ['findings', 'diagnosis', 'conclusion', 'pathologyFindings', 'pathologyDiagnosis'];
    if (fields.some(key => String(item[key] || '').trim() && !isNarrativeAnchored(item[key], clinicalText))) return false;
    if (item.itemType === 'lab' || item.itemType === 'data') {
      return isAnchored(item.name, transcript) && isAnchored(item.value, transcript)
        && (!item.unit || isAnchored(item.unit, transcript));
    }
    // Neither a project title nor a caliper number is a narrative finding.
    return ['findings', 'diagnosis'].some(key => isNarrativeAnchored(item[key], clinicalText))
      && (!item.value || isAnchored(item.value, transcript));
  });
  const blockedCount = candidates.length - items.length;
  const status = imageOnly ? 'image_only'
    : evidence.readability !== 'clear' || blockedCount ? 'needs_review' : 'verified';
  const pageEvidence = { status, blockedCount, message: imageOnly ? IMAGE_ONLY_MESSAGE : status === 'needs_review' ? UNVERIFIED_MESSAGE : '' };
  return { ...parsed, items, summary: '', pageType: imageOnly ? 'image_only' : parsed.pageType,
    skipPage: imageOnly || parsed.skipPage === true, imageEvidence: pageEvidence };
}

// Shared by full PDF/image OCR and every supplement/retry. Independent transcription never sees
// candidate findings. Bounded per-job cache avoids paying for the same image on each retry.
function createReportImageParser(parseImage, { onEvidence = () => {}, report = {} } = {}) {
  const cache = new Map();
  const imageOnlyPages = new Map();
  const imageReport = /ultrasound|radiology|mri|endoscopy|ecg|imaging/i.test(report.type || '')
    || /超声|彩超|B超|内镜|胃镜|肠镜|磁共振|心电|CT|MRI/i.test(report.title || '');
  return async (source, prompt, options = {}) => {
    const { sourcePage } = options;
    const modelOptions = { ...options, ...(report._id ? { reportId: String(report._id) } : {}) };
    if (imageOnlyPages.has(sourcePage)) {
      const skipped = imageOnlyPages.get(sourcePage);
      onEvidence(sourcePage, skipped.imageEvidence);
      return JSON.stringify(skipped);
    }
    const raw = await parseImage(source, prompt, modelOptions);
    const parsed = parseJSON(raw);
    if (!parsed || !Array.isArray(parsed.items)) return raw;
    // Only this guard may attach verification metadata; model/source-provided flags are untrusted.
    delete parsed.imageEvidence;
    const needsCheck = imageReport || parsed.hasMedicalImages === true || parsed.pageType === 'image_only'
      || parsed.items.some(item => ['imaging', 'diagnosis', 'pathology'].includes(item.itemType)
        || item.findings || item.diagnosis || /超声|彩超|B超|内镜|心电|CT|MRI/i.test(item.name || ''));
    if (!needsCheck) return JSON.stringify(parsed);
    const key = createHash('sha256').update(source).digest('hex');
    if (!cache.has(key)) {
      if (cache.size >= 24) cache.delete(cache.keys().next().value);
      const pending = parseImage(source, IMAGE_EVIDENCE_PROMPT, {
        ...modelOptions, stage: 'evidence', model: 'qwen-vl-plus', maxTokens: 8192, timeoutMs: 45000,
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
    const guarded = guardImageEvidence(parsed, evidence);
    if (Number.isInteger(sourcePage) && guarded.imageEvidence?.status === 'image_only') {
      imageOnlyPages.set(sourcePage, guarded);
    }
    if (guarded.imageEvidence) onEvidence(sourcePage, guarded.imageEvidence);
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
  guardImageEvidence, createReportImageParser, recordPageEvidence };
