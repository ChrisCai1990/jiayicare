const { createHash } = require('crypto');

const FIELDS = ['name', 'bodyPart', 'findings', 'diagnosis'];

function sourceForTranslation(report) {
  return {
    title: String(report.title || ''),
    items: (report.reportItems || []).map(item => Object.fromEntries(FIELDS.map(field => [field, String(item[field] || '')]))),
  };
}

function sourceHash(source) {
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function validateTranslation(result, source) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || typeof result.title !== 'string' || !result.title.trim()
      || !Array.isArray(result.items) || result.items.length !== source.items.length) return null;
  const items = [];
  for (let index = 0; index < source.items.length; index += 1) {
    const row = result.items[index];
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const translated = {};
    for (const field of FIELDS) {
      if (typeof row[field] !== 'string' || (source.items[index][field] && !row[field].trim())) return null;
      translated[field] = source.items[index][field] ? row[field].trim() : '';
    }
    items.push(translated);
  }
  return { title: result.title.trim(), items };
}

module.exports = { sourceForTranslation, sourceHash, validateTranslation };
