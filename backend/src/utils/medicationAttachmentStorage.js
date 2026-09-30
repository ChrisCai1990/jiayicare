const { urlToKey } = require('./oss');
const previewPath = /^\/api\/staff\/patients\/([a-f\d]{24})\/medications\/([a-f\d]{24})\/attachments\/(\d+)\/preview$/i;
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
function canonicalUrl(value) {
  if (!urlToKey(value)) return value;
  const url = new URL(value);
  url.search = ''; url.hash = '';
  return url.toString();
}
async function normalizeMedicationAttachments(values, patientId, Medication) {
  const result = [];
  for (const value of (Array.isArray(values) ? values : []).filter(v => typeof v === 'string' && v.trim()).slice(0,6)) {
    const url = value.trim();
    let parsed;
    try { parsed = new URL(url, 'https://jiaycare.com'); } catch { throw invalid('附件地址无效'); }
    const match = parsed.pathname.match(previewPath);
    if (!match) { result.push(canonicalUrl(url)); continue; }
    if (match[1] !== String(patientId)) throw invalid('不能引用其他客户的附件');
    // Old clients send display URLs back on save. Resolve the record reference
    // using the authenticated patient's ownership, not the expiring URL token.
    const source = await Medication.findOne({ _id: match[2], user: patientId }).select('imageUrls').lean();
    const original = source?.imageUrls?.[Number(match[3])];
    if (!original || previewPath.test(new URL(original, 'https://jiaycare.com').pathname)) {
      throw invalid('附件原始地址失效，请刷新并重新核对处方附件');
    }
    result.push(canonicalUrl(original));
  }
  return result;
}
module.exports = { normalizeMedicationAttachments, canonicalUrl };
