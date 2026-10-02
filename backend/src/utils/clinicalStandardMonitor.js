const crypto = require('crypto');
const { standards } = require('../../../shared/clinicalStandards.cjs');
const ClinicalStandardWatch = require('../models/ClinicalStandardWatch');
const ClinicalStandardUpdate = require('../models/ClinicalStandardUpdate');

const WEEK = 7 * 24 * 60 * 60 * 1000;
const YEAR = 365 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;

function canonicalContent(bytes, type) {
  if (type.includes('pdf')) return bytes;
  const html = bytes.toString('utf8');
  const text = html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (text.length < 100) throw new Error('来源正文过短，无法核对');
  return Buffer.from(text);
}

async function fetchFingerprint(standard, fetchImpl = fetch) {
  const original = new URL(standard.sourceUrl);
  if (original.protocol !== 'https:' || !['www.acr.org', 'pubmed.ncbi.nlm.nih.gov'].includes(original.hostname)) throw new Error('来源不在可信站点列表');
  let url = standard.sourceUrl;
  let response;
  for (let redirect = 0; redirect < 3; redirect++) {
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'JiayiCare-ClinicalStandardMonitor/1.0' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = new URL(response.headers.get('location') || '', url);
    if (next.protocol !== 'https:' || !['www.acr.org', 'pubmed.ncbi.nlm.nih.gov'].includes(next.hostname)) throw new Error('来源跳转到非可信站点');
    url = next.href;
  }
  if (!response.ok) throw new Error(`来源返回 HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!/(text\/html|application\/pdf)/i.test(type)) throw new Error('来源格式不受支持');
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new Error('来源文件过大');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error('来源文件过大');
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return crypto.createHash('sha256').update(canonicalContent(Buffer.concat(chunks), type)).digest('hex');
}

async function checkOne(standard, { force = false, fetchImpl = fetch } = {}) {
  if (standard.monitor !== 'source') return { standardId: standard.id, outcome: 'manual' };
  const now = new Date();
  const watch = await ClinicalStandardWatch.findOneAndUpdate(
    { standardId: standard.id, $and: [{ $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, ...(force ? {} : { $or: [{ nextCheckAt: null }, { nextCheckAt: { $lte: now } }] })] },
    { $set: { leaseUntil: new Date(now.getTime() + 30000) }, $setOnInsert: { standardId: standard.id } },
    { new: true, upsert: true },
  ).catch(error => { if (error.code === 11000) return null; throw error; });
  if (!watch) return { standardId: standard.id, outcome: 'not_due' };
  try {
    const fingerprint = await fetchFingerprint(standard, fetchImpl);
    const changed = !!watch.fingerprint && watch.fingerprint !== fingerprint;
    if (changed || !watch.fingerprint) await ClinicalStandardUpdate.updateOne(
      { standardId: standard.id, fingerprint },
      { $setOnInsert: { standardId: standard.id, fingerprint, sourceUrl: standard.sourceUrl, trigger: changed ? 'source_changed' : 'baseline_review', detectedAt: now, status: 'pending' } },
      { upsert: true },
    );
    if (watch.fingerprint && watch.annualReviewYear < now.getUTCFullYear()) await ClinicalStandardUpdate.updateOne(
      { standardId: standard.id, fingerprint: `annual:${now.getUTCFullYear()}` },
      { $setOnInsert: { standardId: standard.id, fingerprint: `annual:${now.getUTCFullYear()}`, sourceUrl: standard.sourceUrl, trigger: 'scheduled_review', detectedAt: now, status: 'pending' } },
      { upsert: true },
    );
    await ClinicalStandardWatch.updateOne({ _id: watch._id }, { $set: { fingerprint, checkedAt: now, nextCheckAt: new Date(now.getTime() + WEEK), annualReviewYear: now.getUTCFullYear(), lastError: '', sourceFinalUrl: standard.sourceUrl }, $unset: { leaseUntil: 1 } });
    return { standardId: standard.id, outcome: changed ? 'change_pending_review' : watch.fingerprint ? 'unchanged' : 'baseline_pending_review' };
  } catch (error) {
    await ClinicalStandardWatch.updateOne({ _id: watch._id }, { $set: { checkedAt: now, nextCheckAt: new Date(now.getTime() + WEEK), lastError: String(error.message).slice(0, 300) }, $unset: { leaseUntil: 1 } });
    return { standardId: standard.id, outcome: 'error', error: error.message };
  }
}

async function scheduleManualReview(standard) {
  const now = new Date();
  const watch = await ClinicalStandardWatch.findOne({ standardId: standard.id }).lean();
  if (watch?.nextCheckAt && watch.nextCheckAt > now) return { standardId: standard.id, outcome: 'not_due' };
  const fingerprint = `manual:${now.getUTCFullYear()}`;
  await ClinicalStandardUpdate.updateOne({ standardId: standard.id, fingerprint }, { $setOnInsert: {
    standardId: standard.id, fingerprint, sourceUrl: standard.sourceUrl, trigger: 'scheduled_review', detectedAt: now, status: 'pending',
  } }, { upsert: true });
  await ClinicalStandardWatch.updateOne({ standardId: standard.id }, { $set: { checkedAt: now, nextCheckAt: new Date(now.getTime() + YEAR), lastError: '' } }, { upsert: true });
  return { standardId: standard.id, outcome: 'scheduled_review' };
}

async function checkAll(options = {}) {
  const results = [];
  for (const standard of standards) results.push(standard.monitor === 'source' ? await checkOne(standard, options) : await scheduleManualReview(standard));
  return results;
}

function startClinicalStandardMonitor() {
  if (process.env.CLINICAL_STANDARD_MONITOR_ENABLED === 'false') return;
  const run = () => checkAll().catch(error => console.error('[clinical-standard-monitor]', error));
  setTimeout(run, 15000);
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

module.exports = { canonicalContent, fetchFingerprint, checkOne, checkAll, startClinicalStandardMonitor };
